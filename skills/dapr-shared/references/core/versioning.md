# Workflow Versioning

## Overview

Dapr Workflows are durable: a workflow started today may still be running weeks or months
later. When you deploy new code, worker processes resume open workflows through history
**replay** — re-executing the workflow function from the beginning against the recorded
history. If your updated code produces a different sequence of commands than the original
code did, the replay diverges and the workflow fails with a non-determinism error.

Versioning gives you strategies to deploy code changes safely while open workflows are
still running.

**SDK support.** The two features do not ship together, so check them separately:

| Feature | SDKs |
|---|---|
| Named versioning (registration API) | .NET, Go, Python |
| Patching API (`IsPatched`) | .NET, Go, Python, **JavaScript** |

Java has neither, and JavaScript has patching but no named-version registration, so a workflow
in Java — or a JavaScript workflow that needs a full version bump rather than an in-place patch —
uses Blue/Green or a new workflow type, which work in every SDK.

All of this was verified against the packages, not read off a documentation page: a .NET 10
project on `Dapr.Workflow` 1.19.1 compiles `context.IsPatched("...")` and
`builder.Services.AddDaprWorkflowVersioning()`; `dapr[workflow]==1.19.0` exposes
`DaprWorkflowContext.is_patched` and `WorkflowRuntime.versioned_workflow`; and `@dapr/dapr`
3.19.0 declares `WorkflowContext.isPatched(patchName: string): boolean` while its
`WorkflowRuntime` exposes only `registerWorkflow` / `registerWorkflowWithName`, with no
versioned-registration method. Note that the docs.dapr.io versioning page still shows code tabs
for .NET, Go and Python only — JavaScript patching is in the SDK ahead of the documentation.

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

## Strategy 3: Named Versioning (.NET, Go, Python)

Register several implementations of one canonical workflow name. The runtime pins a running
instance to the version it started on; new instances use whichever version is marked latest.

| SDK | How a version is registered |
|---|---|
| Go | `registry.AddVersionedWorkflowN(name, versionName, isLatest, fn)` |
| Python | `@wfr.versioned_workflow(name=..., is_latest=True)` |
| .NET | `builder.Services.AddDaprWorkflowVersioning()`; named versioning is then applied automatically at runtime. `UseDefaultWorkflowStrategy<T>(key)` and `UseDefaultWorkflowSelector<T>()` change the strategy and the selector (default `MaxVersionSelector`). |

**Do not confuse versioning with registration.** The source generator in `Dapr.Workflow` discovers and
registers **both workflows and activities** at build time, and that has nothing to do with versioning:
the docs say you "do not need to opt into named workflow versioning to benefit from this automatic
registration". `AddDaprWorkflow()` is still required to wire up the services, but its options delegate
is optional, and explicit `w.RegisterActivity<T>()` calls remain supported for anyone who wants them.

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

## Strategy 4: Patching API (.NET, Go, Python, JavaScript)

For minor in-place fixes that do not warrant a full new version, branch on whether the patch
was recorded in the workflow's history. This is the closest Dapr equivalent of Temporal's
`GetVersion`, and unlike `GetVersion` it is a boolean, not a version number.

| SDK | Call |
|---|---|
| .NET | `context.IsPatched("<patch-id>")` on `WorkflowContext` |
| Go | `ctx.IsPatched("<patch-id>")` |
| Python | `ctx.is_patched("<patch-id>")` |
| JavaScript | `ctx.isPatched("<patch-id>")` on `WorkflowContext` (`@dapr/dapr` 3.19.0+) |

The Go sample below shows the shape; the branch structure is identical in the other three.

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
- **Never remove, rename, reorder or reuse a patch identifier.** The identifier is matched
  against recorded history, so changing one is the same class of break as reordering
  activities. Step 3 of the lifecycle above is safe only once no instance predates the patch.

## Retiring a version, and the stall that follows getting it wrong

Do not delete an old named version because it looks unused. A workflow instance can sit
dormant for weeks — waiting on an external event or a long timer — and still be pinned to
the version it started on. Delete only after independently confirming nothing in flight or
dormant uses it; `dapr workflow list` is the check, not an assumption about traffic.

When a replica is asked to replay an instance whose version it does not have registered, the
instance goes **STALLED** rather than failing:

```
reason=VERSION_NAME_MISMATCH;description=Version not available: <version>
```

This is recoverable and self-healing: the instance resumes as soon as it is scheduled on a
replica that has the version registered. A STALLED instance during a rolling deployment is
therefore expected and transient. One that stays stalled means no replica can run it any
more — redeploy the missing version rather than terminating the instance.

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
