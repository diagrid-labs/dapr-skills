# Timers

## Overview

Dapr Workflows support durable timers that survive worker crashes and restarts. Unlike
`time.Sleep` — which is non-deterministic in a replaying workflow and must never be used —
durable timers are recorded in the workflow history as first-class events. The workflow
unloads from memory while waiting, and the runtime wakes it up when the timer fires.

Two complementary APIs build on timers:

- **`CreateTimer`** — schedule a delay of any length (seconds to years)
- **`ContinueAsNew`** — atomically restart the workflow with a new history, carrying
  forward any unprocessed events

## Durable Timers

Durable timers are internally backed by Dapr actor reminders, which means:

- They persist through application restarts
- They have no maximum duration limit (a 30-day or 1-year timer is valid)
- They are recorded in workflow history and are fully replayable

```go
func DelayedNotificationWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var req NotificationRequest
    if err := ctx.GetInput(&req); err != nil {
        return nil, err
    }

    // Send an initial confirmation immediately
    if err := ctx.CallActivity(SendConfirmation,
        workflow.WithActivityInput(req)).Await(nil); err != nil {
        return nil, err
    }

    // Wait 30 days — the workflow is safely unloaded from memory
    if err := ctx.CreateTimer(30 * 24 * time.Hour).Await(nil); err != nil {
        return nil, err
    }

    // Send a renewal reminder
    return ctx.CallActivity(SendRenewalReminder,
        workflow.WithActivityInput(req)).Await(nil)
}
```

Named timers can be created using `workflow.WithTimerName(name)`, which helps with
readability in history logs:

```go
ctx.CreateTimer(5*time.Minute, workflow.WithTimerName("retry-delay")).Await(nil)
```

**Never use `time.Sleep` in workflow code.** It is non-deterministic during replay
because the duration is consumed from wall-clock time, not from the workflow's logical
clock. Always use `CreateTimer`.

## ContinueAsNew

Every workflow maintains an append-only history log. Without intervention, a workflow that
loops forever will grow that log without bound, eventually causing memory pressure and
slow replay.

`ContinueAsNew` solves this by atomically completing the current workflow instance and
immediately starting a new one with a fresh history, passing new input. From the outside
the workflow ID remains the same; internally the history is truncated.

```go
func MonitoringWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var state MonitorState
    if err := ctx.GetInput(&state); err != nil {
        return nil, err
    }

    // Do one iteration of monitoring work
    var status HealthStatus
    if err := ctx.CallActivity(CheckHealth,
        workflow.WithActivityInput(state.Target)).Await(&status); err != nil {
        return nil, err
    }

    if status.Unhealthy {
        if err := ctx.CallActivity(AlertOps,
            workflow.WithActivityInput(status)).Await(nil); err != nil {
            return nil, err
        }
    }

    // Wait before next poll, then restart with fresh history
    if err := ctx.CreateTimer(state.Interval).Await(nil); err != nil {
        return nil, err
    }

    state.IterationCount++
    ctx.ContinueAsNew(state)
    return nil, nil
}
```

### Carrying Forward Unprocessed Events

If external events arrive while the workflow is between iterations, they may be lost when
history is truncated. Use `workflow.WithKeepUnprocessedEvents()` to carry buffered events
forward into the new instance:

```go
ctx.ContinueAsNew(state, workflow.WithKeepUnprocessedEvents())
```

## Timer + Event Race (First-to-Complete)

Use a timer alongside a `WaitForExternalEvent` call to implement a deadline. The first
task to complete determines the path taken. See the Approval Flow example in
`references/core/external-events.md` for a full pattern.

```go
approvalTask := ctx.WaitForExternalEvent("Approved", -1)
deadlineTask  := ctx.CreateTimer(24 * time.Hour)

// ... select on whichever fires first ...
```

The timer fires deterministically based on the workflow's logical clock, so replay always
produces the same winner.

## Eternal Workflow Pattern

Combine ContinueAsNew with a timer to build an eternal polling or monitoring loop with
bounded history:

```go
func EternalPollerWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var cfg PollerConfig
    if err := ctx.GetInput(&cfg); err != nil {
        return nil, err
    }

    // Poll once
    var result PollResult
    if err := ctx.CallActivity(Poll,
        workflow.WithActivityInput(cfg)).Await(&result); err != nil {
        // Log but continue looping — don't let a transient failure stop the poller
        cfg.ConsecutiveFailures++
    } else {
        cfg.ConsecutiveFailures = 0
        cfg.LastResult = result
    }

    // Wait for the configured interval
    if err := ctx.CreateTimer(cfg.PollInterval).Await(nil); err != nil {
        return nil, err
    }

    // Restart with a new, bounded history
    ctx.ContinueAsNew(cfg, workflow.WithKeepUnprocessedEvents())
    return nil, nil
}
```

Each iteration of the loop creates only a small number of history events (one timer, one
activity). The history never grows beyond a single iteration's worth of events.

## Choosing Between Timer, Child Workflow, and ContinueAsNew

| Need | Approach |
|------|----------|
| Delay N seconds/minutes | `CreateTimer` |
| Delay between activity retries | Built-in retry policy (uses timers internally) |
| Scheduled future start | `workflow.WithStartTime` on new workflow |
| Bounded loop with no history growth | `ContinueAsNew` |
| Heavy per-iteration work, fan-out | Child workflow per iteration |

## Related

- `references/core/external-events.md` — timer vs event race pattern
- `references/core/child-workflows.md` — alternative to ContinueAsNew for unbounded work
- `references/core/determinism.md` — why `time.Now()` and `time.Sleep` are forbidden
- `references/core/gotchas.md` — Infinite Loops without ContinueAsNew
