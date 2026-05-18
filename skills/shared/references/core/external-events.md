# External Events

## Overview

External events let a running workflow pause at a named wait point and block until an
external system — a human, another service, or another workflow — delivers a signal. The
workflow records the wait in its history and unloads from memory. When the event arrives,
the runtime schedules a replay and the workflow continues from where it left off.

Common use cases include:

- Human-in-the-loop approval flows (manager approves an expense)
- Waiting for an asynchronous third-party callback (payment gateway webhook)
- Coordinating between multiple workflow instances
- Compliance holds requiring manual sign-off before proceeding

External events have a string name and an optional JSON payload. Names are
**case-insensitive** inside the runtime.

## WaitForExternalEvent

Inside a workflow function, call `ctx.WaitForExternalEvent` to block until the named
event arrives. The call returns a `Task`; call `.Await(&output)` to receive the payload.

```go
func ApprovalWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var req ApprovalRequest
    if err := ctx.GetInput(&req); err != nil {
        return nil, err
    }

    // Charge activity runs first
    if err := ctx.CallActivity(ReserveInventory,
        workflow.WithActivityInput(req)).Await(nil); err != nil {
        return nil, err
    }

    // Wait indefinitely for a human decision
    var decision ApprovalDecision
    err := ctx.WaitForExternalEvent("ApprovalReceived", -1).Await(&decision)
    if err != nil {
        return nil, err
    }

    if decision.Approved {
        return ctx.CallActivity(FulfillOrder,
            workflow.WithActivityInput(req)).Await(nil)
    }
    return ctx.CallActivity(CancelOrder,
        workflow.WithActivityInput(req)).Await(nil)
}
```

### Timeout Behavior

The second argument to `WaitForExternalEvent` controls the wait:

| Value | Behavior |
|-------|----------|
| Negative (`-1`) | Wait indefinitely |
| `0` | Return immediately canceled if no event buffered |
| Positive (`5 * time.Minute`) | Cancel after that duration, `Await` returns `ErrTaskCanceled` |

A positive timeout is implemented internally as a durable timer, so it survives worker
restarts.

```go
// Wait up to 24 hours for approval
var decision ApprovalDecision
err := ctx.WaitForExternalEvent("ApprovalReceived",
    24 * time.Hour).Await(&decision)
if errors.Is(err, task.ErrTaskCanceled) {
    // Deadline passed — auto-reject
    return ctx.CallActivity(AutoReject,
        workflow.WithActivityInput(req)).Await(nil)
}
```

### Multiple Events with the Same Name

Workflows can call `WaitForExternalEvent` multiple times with the same name. Events are
dispatched to waiting tasks in FIFO order. If an event arrives before the workflow has
reached the wait point, it is buffered in history and consumed immediately when the
workflow does call `WaitForExternalEvent`.

## RaiseEvent API

Events are delivered to a workflow from outside using the raise-event API. Three delivery
mechanisms are supported:

### Go SDK Client

```go
err := client.RaiseEvent(ctx, instanceID, "ApprovalReceived",
    workflow.WithEventPayload(ApprovalDecision{Approved: true}))
```

### Dapr CLI

```bash
dapr workflow raise-event <instanceID>/ApprovalReceived \
  --app-id myapp \
  --input '{"approved": true, "reviewer": "alice@example.com"}'
```

### HTTP API

```bash
curl -X POST \
  "http://localhost:3500/v1.0/workflows/dapr/<instanceID>/raiseEvent/ApprovalReceived" \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "reviewer": "alice@example.com"}'
```

All three mechanisms are equivalent. The component name `dapr` is used for the built-in
Dapr Workflow engine.

## SuspendWorkflow / ResumeWorkflow

Suspend and resume are coarser-grained controls than external events. Suspending a
workflow causes it to buffer all new events (including timers firing and activity
completions) without processing them. The workflow state is preserved. Resuming drains
the buffer and continues normal execution.

Use suspend/resume for:
- Manual intervention holds ("stop everything until compliance review completes")
- Regulated workflows where no step may proceed without an external gate
- Debugging: freeze a running workflow to inspect its state without terminating it

```go
// Operator suspends the workflow
err := client.SuspendWorkflow(ctx, instanceID, "Awaiting compliance review")

// ... time passes, compliance team signs off ...

// Operator resumes
err = client.ResumeWorkflow(ctx, instanceID, "Compliance approved by Alice")
```

### CLI equivalents

```bash
dapr workflow suspend <instanceID> --app-id myapp --reason "Awaiting compliance review"
dapr workflow resume  <instanceID> --app-id myapp --reason "Compliance approved by Alice"
```

### HTTP API

```bash
# Suspend
curl -X POST \
  "http://localhost:3500/v1.0/workflows/dapr/<instanceID>/pause"

# Resume
curl -X POST \
  "http://localhost:3500/v1.0/workflows/dapr/<instanceID>/resume"
```

Note: the HTTP API uses `pause` / `resume` as the path segments, whereas the Go SDK and
CLI use `Suspend` / `Resume`.

**Suspend vs WaitForExternalEvent:** Use `WaitForExternalEvent` when the workflow itself
knows it needs to wait for a specific named signal. Use `SuspendWorkflow` when an external
operator needs to freeze execution for reasons the workflow logic doesn't know about.

## Approval Flow Pattern

A complete approval workflow with a deadline:

```go
func ExpenseApprovalWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var req ExpenseRequest
    if err := ctx.GetInput(&req); err != nil {
        return nil, err
    }

    // Notify approver
    if err := ctx.CallActivity(NotifyApprover,
        workflow.WithActivityInput(req)).Await(nil); err != nil {
        return nil, err
    }

    // Wait up to 48 hours
    var decision ApprovalDecision
    err := ctx.WaitForExternalEvent("ExpenseApproval",
        48*time.Hour).Await(&decision)

    switch {
    case errors.Is(err, task.ErrTaskCanceled):
        // Timed out — escalate
        return ctx.CallActivity(EscalateToManager,
            workflow.WithActivityInput(req)).Await(nil)
    case err != nil:
        return nil, err
    case decision.Approved:
        return ctx.CallActivity(ProcessExpense,
            workflow.WithActivityInput(req)).Await(nil)
    default:
        return ctx.CallActivity(RejectExpense,
            workflow.WithActivityInput(req)).Await(nil)
    }
}
```

## Timer vs Event Race Pattern

Race a human decision against a deadline using parallel tasks. The first task to complete
wins; the loser is abandoned.

```go
func OrderWithDeadlineWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var order Order
    if err := ctx.GetInput(&order); err != nil {
        return nil, err
    }

    approvalTask := ctx.WaitForExternalEvent("OrderApproved", -1)
    timeoutTask  := ctx.CreateTimer(30 * time.Minute)

    // Whichever completes first determines the outcome
    selector := workflow.NewTaskSelector()
    selector.AddTask(approvalTask, func(t workflow.Task) {
        // approval won the race
    })
    selector.AddTask(timeoutTask, func(t workflow.Task) {
        // deadline won the race
    })
    selector.Next()

    if approvalTask.IsComplete() {
        var decision ApprovalDecision
        if err := approvalTask.Await(&decision); err != nil {
            return nil, err
        }
        if decision.Approved {
            return ctx.CallActivity(FulfillOrder,
                workflow.WithActivityInput(order)).Await(nil)
        }
    }
    // Timed out or rejected
    return ctx.CallActivity(CancelOrder,
        workflow.WithActivityInput(order)).Await(nil)
}
```

Note: `workflow.NewTaskSelector()` is available in the Go SDK. See language-specific
references for the equivalent API in .NET, Java, Python, and JavaScript.

## Related

- `references/core/timers.md` — durable timers used for event timeouts
- `references/core/patterns.md` — external system interaction pattern
- `references/core/gotchas.md` — Side Effects in Workflow Code
