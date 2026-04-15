# Workflow Versioning

## Overview

Dapr Workflows are durable: a workflow started today may still be running weeks or months
later. When you deploy new code, worker processes resume open workflows through history
**replay** — re-executing the workflow function from the beginning against the recorded
history. If your updated code produces a different sequence of commands than the original
code did, the replay diverges and the workflow fails with a non-determinism error.

Versioning gives you strategies to deploy code changes safely while open workflows are
still running.

**Status note:** Named versioning and the patching API (`IsPatched`) are implemented in
`durabletask-go` and available today in the Go SDK. The full cross-SDK versioning
experience described in [proposal #20251028](https://github.com/dapr/proposals/blob/main/20251028-BRS-workflow-versioning.md)
is still in proposal/review stage. The Blue/Green and new-type strategies work today in
all SDKs regardless of proposal status.

## Why Code Changes Break Replay

During replay, the workflow engine matches recorded history events to actions produced by
the running code. If the code produces a different action at the same position in the
sequence, the engine raises a non-determinism error.

```
Original code recorded in history:
  1. CallActivity("CheckInventory")   ← history event #1
  2. CallActivity("ChargePayment")    ← history event #2
  3. CallActivity("ShipOrder")        ← history event #3

Updated code during replay:
  1. CallActivity("CheckInventory")   ← matches #1 ✓
  2. CallActivity("RunFraudCheck")    ← MISMATCH with #2 ✗  → non-determinism error
```

**Safe changes** (do not affect the command sequence and do not require versioning):
- Changing activity implementation logic
- Changing retry policy parameters
- Adding new signal/event handler branches that were never triggered
- Renaming variables, refactoring internal helpers

**Breaking changes** (require a versioning strategy):
- Adding, removing, or reordering activity calls or child workflow calls
- Changing timer durations
- Changing the workflow function signature
- Any change that alters which commands are produced in what order

## Strategy 1: Blue/Green Deployment (Simplest)

The safest approach: wait for all open instances of the old workflow to complete before
deploying code that changes the command sequence.

**Process:**
1. Stop routing new workflow starts to `OrderWorkflow` (or drain them to zero)
2. Wait until `dapr workflow list --app-id myapp --filter-name OrderWorkflow --filter-status RUNNING` returns empty
3. Deploy the updated code
4. Resume routing new starts

**When to use:** Short-lived workflows (under an hour), low-traffic scenarios, or when
you have a maintenance window. Not practical for long-running workflows that may run for
days or weeks.

## Strategy 2: New Workflow Type

Register the updated logic under a new workflow type name. Both old and new types run
side-by-side on the same worker. New workflow starts go to the new type; in-flight
workflows on the old type complete normally.

```go
// Before: single type
r.RegisterWorkflow(OrderWorkflow)

// After: both types registered on the same worker
r.RegisterWorkflow(OrderWorkflow)   // keeps running old instances
r.RegisterWorkflow(OrderWorkflowV2) // new instances start here
```

New workflow starts must be directed to the new type:

```go
// Client code updated to use new type name
_, err := client.ScheduleNewWorkflow(ctx, "OrderWorkflowV2",
    workflow.WithInput(req))
```

**Cleanup:** Once all `OrderWorkflow` instances have completed, remove the old
registration and delete the old function. Use `dapr workflow list` to verify no instances
remain.

**When to use:** Major rewrites, incompatible changes, or when you want a clean
separation between old and new logic.

## Strategy 3: Named Versioning (Go SDK, Available Now)

The `durabletask-go` registry supports named versioning directly. Register multiple
implementations of the same canonical workflow name. The runtime pins a running instance
to the version it started on; new instances use whichever version is marked `isLatest`.

```go
// Register v1 (not latest — kept for in-flight instances)
r.AddVersionedWorkflowN("OrderWorkflow", "OrderWorkflow_v1", false, OrderWorkflowV1)

// Register v2 as the new latest
r.AddVersionedWorkflowN("OrderWorkflow", "OrderWorkflow_v2", true, OrderWorkflowV2)
```

- New workflow starts are routed to `OrderWorkflow_v2` automatically.
- In-flight instances that started on `OrderWorkflow_v1` continue on v1.
- If a worker receives a replay for a version it doesn't have registered, it responds
  with `OrchestratorVersionNotAvailable`, and the runtime will retry later.

The canonical name ("OrderWorkflow") is used everywhere externally. The version name is
an internal routing detail.

## Strategy 4: Patching API (Go SDK, Available Now)

For minor in-place fixes that do not warrant a full new version, use `ctx.IsPatched` to
branch code based on whether the patch was recorded in the workflow's history.

```go
func OrderWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    // ... existing activities ...

    if ctx.IsPatched("add-fraud-check") {
        // New path: recorded in history for new and re-executing patched workflows
        var fraudResult FraudResult
        if err := ctx.CallActivity(RunFraudCheck,
            workflow.WithActivityInput(order)).Await(&fraudResult); err != nil {
            return nil, err
        }
        if fraudResult.Flagged {
            return nil, errors.New("order flagged for fraud")
        }
    }
    // Old path: in-flight workflows that started before this patch skip the branch

    return ctx.CallActivity(ChargePayment,
        workflow.WithActivityInput(order)).Await(nil)
}
```

**How it works:**
- During replay of an old instance (no patch in history): `IsPatched` returns `false` →
  old code path executes → deterministic.
- During first execution of a new instance (or at the end of history): `IsPatched`
  returns `true` → new code path executes → patch is recorded in the next
  `OrchestratorStarted` event.

**Patch lifecycle:**
1. **Apply** — add both code paths guarded by `IsPatched`.
2. **Wait** — let all pre-patch instances complete.
3. **Cleanup** — remove the `IsPatched` guard and the old code path. The patch name can
   be removed once no instance was started before it.

**Constraints:**
- Patches cannot overlap (the same position in history cannot have two active patches).
- Use descriptive patch IDs: `"add-fraud-check"` not `"patch-1"`.
- Patching is for minor fixes; use named versioning for larger changes.

## Migration Strategies for Long-Running Workflows

When a workflow may run for weeks or months and cannot be drained before a breaking
change is deployed:

| Approach | When to Use |
|----------|-------------|
| Named versioning | Structural changes, multiple in-flight versions expected |
| Patching | Bug fixes, adding a single new step without restructuring |
| Terminate + rerun | Acceptable to lose in-flight state (non-critical workflows) |
| Wait for completion | Short-lived workflows, maintenance window available |

For workflows that cannot tolerate termination, always use named versioning or patching.
Never deploy breaking changes to workflow code when in-flight instances exist without one
of these strategies in place.

## Finding In-Flight Instances Before Deploying

```bash
# List all running instances of a workflow type
dapr workflow list \
  --app-id myapp \
  --filter-name OrderWorkflow \
  --filter-status RUNNING \
  --output json

# Count them
dapr workflow list --app-id myapp --filter-name OrderWorkflow \
  --filter-status RUNNING | wc -l
```

Verify this returns zero (or an acceptable count for your migration strategy) before
deploying a breaking change.

## Best Practices

1. **Plan versioning before writing code** — deciding the strategy after the fact is
   harder.
2. **Use descriptive patch IDs** — patch names are permanent markers in history.
3. **Test replay before deploying** — save a workflow history snapshot and verify new
   code replays it without error.
4. **Keep old registrations until all instances complete** — removing a type while
   instances are still running will cause them to stall.
5. **Document which version is current** — in team environments, track active version
   names alongside the deployment pipeline.

## Related

- `references/core/determinism.md` — why determinism is required and how replay works
- `references/core/gotchas.md` — Multiple Workers with Different Code
- proposal `20251028-BRS-workflow-versioning.md` — full cross-SDK versioning design
