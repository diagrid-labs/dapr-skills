# Activity Patterns

Activities are the unit of work in Dapr Workflows. They are where all non-deterministic
operations live: API calls, database queries, file I/O, UUID generation, and anything
else that touches external state. Unlike workflow code — which is replayed from history
on every activation — an activity executes exactly once per invocation, and its result
is persisted in the workflow history before the workflow resumes.

## Activities vs Workflow Code

The boundary between workflow code and activity code follows a single rule: determinism.
If an operation produces different results on different calls, it belongs in an activity.

| Operation | Where | Why |
|---|---|---|
| HTTP / gRPC calls | Activity | External state changes on every call |
| Database reads and writes | Activity | Data changes between replays |
| File I/O | Activity | Filesystem state is external |
| Random number / UUID generation | Activity (or SDK helper) | Non-deterministic by definition |
| Current time | Activity (or SDK helper) | Wall clock advances between replays |
| If/else branching on workflow data | Workflow | Pure deterministic control flow |
| Aggregating activity results | Workflow | Pure computation over known values |
| Scheduling other activities or child workflows | Workflow | Orchestration logic |
| Waiting for external events or timers | Workflow | Durable waits, handled by the engine |

Using a workflow SDK helper (e.g. `ctx.CurrentUTCDateTime()`) for time and UUIDs is
equivalent to calling an activity — the helper captures the value in history so replays
return the same result.

## At-Least-Once Semantics

The Dapr Workflow engine guarantees that every scheduled activity executes **at least
once**. It does NOT guarantee exactly-once execution. An activity may run more than once
because:

- The worker process crashed after the activity completed but before the result was
  written back to the sidecar.
- The activity actor timed out and the engine retried it.
- Infrastructure issues caused a duplicate delivery.

**All activities must be idempotent.** Designing for at-least-once means that running the
same activity twice with the same inputs must produce the same observable outcome.

### Idempotency key strategies

Pass a deduplication key into every external operation so the downstream system can detect
and ignore duplicate requests:

```go
// BAD: no deduplication — sends duplicate emails on retry
func SendConfirmationEmail(ctx workflow.ActivityContext) (any, error) {
    var input OrderInput
    ctx.GetInput(&input)
    return emailService.Send(input.CustomerEmail, "Order confirmed")
}

// GOOD: idempotency key derived from workflow instance ID + task ID
func SendConfirmationEmail(ctx workflow.ActivityContext) (any, error) {
    var input OrderInput
    ctx.GetInput(&input)
    idempotencyKey := fmt.Sprintf("%s-%d", input.WorkflowInstanceID, ctx.GetTaskID())
    return emailService.SendWithKey(idempotencyKey, input.CustomerEmail, "Order confirmed")
}
```

Good sources for idempotency keys:
- Workflow instance ID — unique per workflow run, stable across retries.
- Workflow instance ID + task ID — unique per activity invocation within a run.
- Domain-specific IDs passed in the activity input (order ID, transaction ID).

## Retry Policies

Retry policies are configured at the call site in workflow code, not inside the activity
itself. They are durable — retry timers survive process restarts.

```go
ctx.CallActivity(ChargePayment, workflow.WithActivityRetryPolicy(&workflow.RetryPolicy{
    MaxAttempts:          5,
    InitialRetryInterval: 500 * time.Millisecond,
    BackoffCoefficient:   2.0,
    MaxRetryInterval:     30 * time.Second,
    RetryTimeout:         5 * time.Minute,
}), workflow.WithActivityInput(input)).Await(&result)
```

| Parameter | Description |
|---|---|
| `MaxAttempts` | Total executions including the first (not just retries). |
| `InitialRetryInterval` | Wait before the first retry. |
| `BackoffCoefficient` | Multiplier applied to the wait on each subsequent retry (1.0 = no growth). |
| `MaxRetryInterval` | Upper bound on the per-retry wait, regardless of coefficient. |
| `RetryTimeout` | Global deadline across all retry attempts. |
| `Handle` (Go) | Optional function `func(error) bool`; return `false` to stop retrying. |

**Default behavior:** If no retry policy is provided, a failed activity propagates its
error to the workflow immediately with no retries.

### When to retry

Retry transient failures where the underlying operation may succeed if tried again:
- Network timeouts and connection resets.
- HTTP 429 (rate limited) or 503 (service unavailable).
- Transient database errors (deadlock, connection pool exhaustion).

### When NOT to retry

Do not retry errors that will never succeed without a code or data change:
- Input validation failures.
- Business logic rejections (e.g. insufficient funds, order already cancelled).
- Permanent HTTP 4xx errors (400, 401, 403, 404).

Use the `Handle` function (Go) or language-equivalent to inspect the error type and
return `false` for non-retryable conditions. See the language-specific
`error-handling.md` reference for SDK-specific patterns.

## Input/Output Constraints

Activity inputs and outputs are serialized to JSON and appended to the workflow history
stored in the state store. Large payloads make the history large, which slows replay and
increases storage costs.

**Keep inputs small.** Pass identifiers, not full objects:

```go
// BAD: passes 50-field struct into history
type OrderInput struct { /* 50 fields */ }
ctx.CallActivity(FulfillOrder, workflow.WithActivityInput(fullOrder))

// GOOD: pass only what the activity needs to look up
type FulfillOrderInput struct {
    OrderID    string
    WorkflowID string // for idempotency key
}
ctx.CallActivity(FulfillOrder, workflow.WithActivityInput(FulfillOrderInput{
    OrderID:    order.ID,
    WorkflowID: ctx.InstanceID(),
}))
```

**Keep outputs small.** Return status and IDs rather than full response bodies:

```go
// BAD: returns 10 MB API response into workflow history
func FetchReport(ctx workflow.ActivityContext) (any, error) {
    return reportService.GetFullReport(reportID) // large blob
}

// GOOD: store large data externally, return a reference
func FetchReport(ctx workflow.ActivityContext) (any, error) {
    report, _ := reportService.GetFullReport(reportID)
    url, _ := blobStorage.Upload(reportID, report)
    return FetchReportResult{BlobURL: url, RowCount: report.RowCount}, nil
}
```

## Activity Design Patterns

### Idempotency key pattern

Include a deduplication key in every call to a non-idempotent external system. Derive it
from the workflow instance ID and task ID so it is stable across retries and unique across
different activity invocations.

### Check-then-act pattern

Read current state before performing a mutating operation to short-circuit when the work
is already done. This is especially useful when retrying after a partial failure:

```go
func CreateShipment(ctx workflow.ActivityContext) (any, error) {
    var input CreateShipmentInput
    ctx.GetInput(&input)
    // Short-circuit if the shipment was already created on a previous attempt.
    existing, err := shipments.FindByIdempotencyKey(input.IdempotencyKey)
    if err == nil {
        return existing.ID, nil
    }
    return shipments.Create(input)
}
```

### External service wrapper

Wrap third-party APIs in an activity that categorizes errors as retryable or permanent
before returning. This keeps retry logic out of workflow orchestration code and makes the
boundary explicit.

### Batch processing

For large datasets, choose the granularity that matches your throughput and history size
requirements:

- **Single activity per batch:** process N items in one activity call. Simpler history,
  but the whole batch retries on failure.
- **Fan-out per item:** schedule one activity per item using parallel `CallActivity` calls.
  Each item retries independently, but adds one history entry per item.
- **Chunked fan-out:** split items into fixed-size chunks, schedule one activity per chunk.
  Balances retry granularity against history size.

See `references/core/patterns.md` for fan-out/fan-in workflow-level implementation.
