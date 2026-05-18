# Testing Workflows

## Overview

Dapr Workflow code requires a different testing strategy than ordinary application code because:

1. **Workflow functions are not called directly** — they execute inside the durabletask runtime, driven by history events.
2. **Determinism is a correctness requirement** — the same input must always produce the same execution sequence.
3. **Activities are the boundary for side effects** — all I/O, network calls, and non-deterministic operations must live in activities, which can be tested and mocked independently.

**Testing pyramid for workflows:**

| Layer | What to Test | Tools |
|---|---|---|
| Unit (activity) | Activity business logic in isolation | Standard unit testing framework |
| Unit (workflow) | Orchestration logic with mocked activities | Currently requires manual mocking (see gap note below) |
| Integration | End-to-end workflow with real Dapr sidecar | `dapr run` + test client |

---

## Unit Testing Workflow Logic

The goal is to verify that the workflow calls activities in the correct order, with the correct inputs, and handles activity results and errors correctly — without running a real Dapr sidecar.

**Current state (gap):** The Dapr Go SDK (`go-sdk`) does not expose a mock runtime or test harness for injecting fake activity results directly into a workflow function. There is no `WorkflowTestEnvironment` equivalent at the SDK layer as of the current release.

**Recommended approach — test via integration (see below).** For pure unit-level isolation, you can structure workflow code so the orchestration logic is testable:

1. **Extract decision logic into pure functions.** Keep the workflow function thin: it calls activities and branches on results. Move business decisions into pure functions that can be tested without the runtime.

2. **Test the pure functions directly.** These have no dependency on `WorkflowContext` and can be called in a plain unit test.

**Example (Go):**

```go
// Pure function — testable without workflow runtime
func nextApprovalStep(amount float64, currentApprovals []string) string {
    if amount > 10000 {
        return "executive-approval"
    }
    return "manager-approval"
}

// Workflow function — thin orchestration shell
func OrderApprovalWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var input OrderInput
    if err := ctx.GetInput(&input); err != nil {
        return nil, err
    }
    step := nextApprovalStep(input.Amount, nil)
    var result ApprovalResult
    if err := ctx.CallActivity(RequestApproval, workflow.WithActivityInput(step)).Await(&result); err != nil {
        return nil, err
    }
    return result, nil
}
```

The `nextApprovalStep` function is unit-testable. The `OrderApprovalWorkflow` function requires integration testing.

---

## Unit Testing Activities

Activities are ordinary functions (or methods). They receive a context and an input, perform I/O, and return a result. They have no dependency on workflow-specific APIs beyond reading their input.

**Test activities like any other function:**

```go
// Activity function
func ChargePaymentActivity(ctx workflow.ActivityContext) (any, error) {
    var input ChargeInput
    if err := ctx.GetInput(&input); err != nil {
        return nil, err
    }
    // call payment service...
    return ChargeResult{TransactionID: "txn-123"}, nil
}

// Unit test — no Dapr sidecar needed
func TestChargePaymentActivity_Success(t *testing.T) {
    // Inject a fake payment client via closure or interface
    result, err := chargeWithClient(fakeClient, ChargeInput{Amount: 50.0})
    assert.NoError(t, err)
    assert.Equal(t, "txn-123", result.TransactionID)
}
```

**Best practices for activity testability:**

- Accept dependencies (HTTP clients, DB connections) via constructor or closure rather than global state.
- Return structured errors that callers can distinguish (retryable vs. non-retryable).
- Keep activities small and focused — one activity per external operation.

---

## Integration Testing

Integration tests run the workflow end-to-end with a real Dapr sidecar. They verify that:
- The workflow starts and reaches the expected terminal status.
- Activities execute and their results flow correctly through the workflow.
- State is persisted correctly across restarts.

**Setup:**

```bash
# Start the app with Dapr sidecar
dapr run \
  --app-id myapp \
  --resources-path ./components \
  -- go run ./cmd/myapp
```

**Test pattern (Go):**

```go
func TestOrderWorkflow_Integration(t *testing.T) {
    ctx := context.Background()
    client, err := dapr.NewClient()
    require.NoError(t, err)
    defer client.Close()

    wclient := client.NewWorkflowClient()

    // Start the workflow
    id, err := wclient.ScheduleWorkflow(ctx, "OrderWorkflow",
        workflow.WithInstanceID("test-order-001"),
        workflow.WithInput(OrderInput{Amount: 100.0}),
    )
    require.NoError(t, err)

    // Wait for completion (poll with timeout)
    var metadata *workflow.WorkflowMetadata
    require.Eventually(t, func() bool {
        metadata, err = wclient.FetchWorkflowMetadata(ctx, id, workflow.WithFetchPayloads(true))
        return err == nil && metadata.IsComplete()
    }, 30*time.Second, 500*time.Millisecond)

    assert.Equal(t, workflow.StatusCompleted, metadata.RuntimeStatus)
}
```

**Infrastructure for integration tests:**
- Use a lightweight state store component (Redis or the in-memory actor state store).
- Run `dapr init` once in CI to install the local runtime.
- Clean up (purge) workflow state after each test to avoid instance ID conflicts.

---

## Replay Testing

**Temporal Go SDK comparison:** Temporal's Go SDK provides a dedicated `testsuite.WorkflowReplayer` that feeds a recorded history file back through the workflow function to verify that updated code still produces the same execution path. This catches non-determinism bugs before deployment.

**Dapr / durabletask-go status:** As of the current release, `durabletask-go` and the Dapr Go SDK do **not** expose a public replay test API equivalent to Temporal's replayer. The `IsReplaying` field exists on `OrchestrationContext` (used internally during normal execution), but there is no test harness that accepts a history file and drives workflow code against it.

**Gap impact:** Without a replay tester, non-determinism bugs are only caught at runtime — when an in-flight workflow resumes on updated code and the execution sequence diverges.

**Recommended alternative:** Use integration tests as the determinism safety net:

1. Run the workflow to completion and record its instance ID.
2. Deploy updated code.
3. In the test, start a *new* workflow with the same input and assert the same final output. This does not test replay of in-flight instances, but does verify output stability.
4. For production safety, follow the versioning guidance in `versioning.md` before deploying any change that alters activity call order.

**Watch for:** Future Dapr or durabletask-go releases may add a replay test API. Check the [durabletask-go changelog](https://github.com/dapr/durabletask-go/releases) when upgrading.

---

## Testing Best Practices

**Determinism verification:**

Run the workflow twice with the same input and assert identical outputs:

```go
func TestWorkflow_Deterministic(t *testing.T) {
    result1 := runWorkflowSync(t, input)
    result2 := runWorkflowSync(t, input)
    assert.Equal(t, result1, result2, "workflow must be deterministic")
}
```

**Timer behavior:**

Timers in workflow code (`ctx.CreateTimer`) cannot be fast-forwarded in Dapr (no test clock). For testing, use short timer durations in test configuration, or redesign the workflow to accept the timer duration as an input parameter.

**Error handling paths:**

Write integration tests for each failure scenario:
- Activity returns a retryable error → verify retry count in metadata.
- Activity exhausts retries → verify workflow reaches `FAILED` status.
- External event never arrives (timer fires first) → verify timeout branch executes.

**Compensation / rollback:**

Test the saga/compensation pattern (see `patterns.md`) by injecting a failure at each step and asserting that all previously completed compensations ran:

```go
// Force failure at step 3; verify steps 1 and 2 were compensated
```

**Isolation between test runs:**

Always purge workflow state after each integration test:

```go
defer wclient.PurgeWorkflow(ctx, id)
```

Or use unique random instance IDs per test run to avoid conflicts with prior state.

## See Also

- [Determinism Constraints](determinism.md) — rules for writing safe workflow code
- [Patterns](patterns.md) — saga, fan-out/fan-in, and other testable patterns
- [Error Reference](error-reference.md) — status codes and error types to assert against
