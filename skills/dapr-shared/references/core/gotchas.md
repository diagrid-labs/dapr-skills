# Common Dapr Workflow Gotchas

Common mistakes and anti-patterns in Dapr Workflow development. Each gotcha follows the
same format: the problem, how it manifests, and the fix.

---

## Non-Idempotent Activities

**The Problem**

Activities execute **at least once**. Retries (due to timeouts, worker crashes, or
transient failures) may cause the same activity to run two or more times. If the activity
calls an external system without an idempotency key, you may charge a customer twice,
send duplicate emails, or insert duplicate records.

**Symptoms**

- Duplicate charges or payments appearing in billing systems after transient failures
- Customers receiving multiple confirmation emails for the same order
- Duplicate rows in a database after a worker restart mid-activity

**The Fix**

Use an idempotency key when calling external services. The workflow instance ID and
activity sequence number form a natural unique key per activity invocation:

```go
func ChargePaymentActivity(ctx workflow.ActivityContext) (any, error) {
    var order Order
    if err := ctx.GetInput(&order); err != nil {
        return nil, err
    }

    // Derive a stable idempotency key from the workflow instance + order
    idempotencyKey := fmt.Sprintf("%s-%s-charge", ctx.GetWorkflowID(), order.ID)

    return paymentClient.Charge(ctx, ChargeRequest{
        Amount:         order.Total,
        IdempotencyKey: idempotencyKey,
    })
}
```

Use domain-specific identifiers (order ID, request ID) when available. Avoid `uuid.New()`
inside an activity as the idempotency key — a retry generates a different UUID.

---

## Side Effects in Workflow Code

**The Problem**

Workflow functions run on first execution **and on every replay**. Any side effect placed
directly in workflow code — logging to an external sink, sending a notification, writing
to a file, incrementing a counter — executes multiple times.

**Symptoms**

- Duplicate log lines in observability tools with slightly different timestamps
- Metrics counters inflated by a factor equal to the number of replays
- Notification services receiving the same event multiple times
- Unexpected writes to external systems during what should be "read-only" replay

**The Fix**

Two options depending on the type of side effect:

1. **Use `ctx.IsReplaying`** to guard log lines and metrics that are safe to skip during
   replay (observability-only, no business logic):

   ```go
   func MyWorkflow(ctx *workflow.WorkflowContext) (any, error) {
       if !ctx.IsReplaying {
           log.Info("workflow started", "instanceID", ctx.ID)
       }
       // ...
   }
   ```

2. **Move all business-logic side effects into activities.** Activities run exactly once
   per scheduled invocation from the parent (retries are tracked separately), so external
   calls belong there:

   ```go
   // DON'T do this inside the workflow function:
   sendgrid.Send(ctx, welcomeEmail)

   // DO this instead:
   ctx.CallActivity(SendWelcomeEmail, workflow.WithActivityInput(user)).Await(nil)
   ```

See `references/core/determinism.md` for the full list of forbidden operations in
workflow code.

---

## Infinite Loops Without ContinueAsNew

**The Problem**

A workflow that loops indefinitely using a `for {}` construct or `while true` accumulates
one history event per iteration. After thousands of iterations the history grows to
hundreds of megabytes. Replay time grows proportionally, eventually causing timeouts and
OOM kills on worker pods.

**Symptoms**

- Workflow replay taking tens of seconds or minutes for long-running workflows
- Worker pods restarting with OOM errors when loading workflow state
- `dapr workflow history` output showing history with tens of thousands of events
- Latency degradation on the workflow component over time

**The Fix**

Use `ContinueAsNew` to truncate history at the end of each logical iteration. The
workflow restarts with a fresh history, carrying only the new input:

```go
// BAD — history grows forever
func BadPollerWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    for {
        ctx.CallActivity(Poll).Await(nil)
        ctx.CreateTimer(5 * time.Minute).Await(nil)
    }
}

// GOOD — history stays bounded
func GoodPollerWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var cfg PollerConfig
    ctx.GetInput(&cfg)

    ctx.CallActivity(Poll, workflow.WithActivityInput(cfg)).Await(nil)
    ctx.CreateTimer(cfg.Interval).Await(nil)

    ctx.ContinueAsNew(cfg, workflow.WithKeepUnprocessedEvents())
    return nil, nil
}
```

Rule of thumb: if a workflow may execute more than a few hundred activities or timers
total over its lifetime, use `ContinueAsNew` or child workflows to keep history bounded.

See `references/core/timers.md` for the full Eternal Workflow pattern.

---

## Large Activity Payloads

**The Problem**

Every activity input and output is serialized into workflow history. Passing large blobs
(images, large JSON documents, bulk data) as activity payloads bloats history, slows
replay, and increases memory pressure on workers.

**Symptoms**

- Slow workflow replay proportional to payload size
- Worker memory pressure when many large-payload workflows replay simultaneously
- Storage costs increasing faster than workflow volume
- gRPC message size errors when payloads approach the 4 MB gRPC limit

**The Fix**

Store large data externally (object storage, database) and pass only a reference (URL,
key, ID) through the workflow:

```go
// DON'T pass large blobs as activity inputs/outputs
ctx.CallActivity(ProcessImage, workflow.WithActivityInput(imageBytes)).Await(&result)

// DO store externally, pass a reference
uploadResult, _ := objectStorage.Upload(imageBytes)
ctx.CallActivity(ProcessImage,
    workflow.WithActivityInput(ImageRef{URL: uploadResult.URL})).Await(&result)
```

Keep activity inputs and outputs under 64 KB as a practical guideline. If an activity
legitimately produces large output that downstream activities need, store it and thread
the reference through.

---

## Direct State Store Access From Workflows

**The Problem**

Workflow code must be deterministic. Calling the Dapr state store API (or any external
system) directly from the workflow function produces non-deterministic behavior: on
replay, the state store may return different data than it did on the first execution,
causing the workflow to diverge.

**Symptoms**

- Non-determinism errors during replay after external state changes
- Workflows behaving differently when replayed on different workers
- Incorrect variable values after a workflow resumes from a crash

**The Fix**

All external I/O must be performed in activities. The workflow only orchestrates the
sequence; activities do the work:

```go
// DON'T read state store directly inside the workflow function
state, _ := daprClient.GetState(ctx, "statestore", "order:123", nil)

// DO delegate to an activity
var order Order
ctx.CallActivity(LoadOrder,
    workflow.WithActivityInput(OrderKey{ID: "123"})).Await(&order)
```

This includes reading config from environment variables, calling HTTP endpoints, querying
databases, and accessing the file system. See `references/core/determinism.md`.

---

## Scheduling Thousands of Tasks in One Workflow

**The Problem**

Scheduling thousands of activities or child workflows in a single parent workflow instance
creates thousands of history events. Replay must process all of them sequentially, making
the workflow slow to resume after a crash or scale-out.

**Symptoms**

- Fan-out workflows with >500 items taking minutes to replay
- Parent workflow history growing to millions of events
- Worker pods stalling on replay while history is processed
- Workflow operations (get status, terminate) becoming slow

**The Fix**

Distribute work across child workflows so no single instance has an unbounded history.
Each child handles a batch; the parent tracks only batch-level completion:

```go
func BulkProcessWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var items []Item
    ctx.GetInput(&items)

    // Split into batches of 50
    batchSize := 50
    tasks := make([]workflow.Task, 0, len(items)/batchSize+1)
    for i := 0; i < len(items); i += batchSize {
        end := min(i+batchSize, len(items))
        batch := items[i:end]
        tasks = append(tasks, ctx.CallSubOrchestrator(ProcessBatch,
            workflow.WithSubOrchestratorInput(batch),
            workflow.WithSubOrchestrationInstanceID(
                fmt.Sprintf("batch-%s-%d", ctx.ID, i/batchSize),
            ),
        ))
    }

    for _, t := range tasks {
        if err := t.Await(nil); err != nil {
            return nil, err
        }
    }
    return nil, nil
}
```

The parent history contains only N/batchSize events. Each child contains at most
batchSize events.

See `references/core/child-workflows.md` for the full fan-out pattern.

---

## Forgetting to Purge Completed State

**The Problem**

Dapr Workflows store full event-sourced history in the configured state store. Completed,
failed, and terminated workflows are not automatically deleted. Over time this causes
unbounded storage growth and can slow down state store queries.

**Symptoms**

- State store storage costs increasing continuously
- State store query latency increasing over weeks
- `dapr workflow list` returning thousands of completed entries

**The Fix**

Purge completed workflows when their results are no longer needed. Purge can be triggered
after a workflow completes:

```go
// Purge a specific completed workflow
err := client.PurgeWorkflow(ctx, instanceID, workflow.WithForcePurge(false))

// Purge and all its child workflows recursively
err = client.PurgeWorkflow(ctx, instanceID, workflow.WithRecursivePurge(true))
```

Via HTTP:

```bash
curl -X POST \
  "http://localhost:3500/v1.0/workflows/dapr/<instanceID>/purge"
```

**Note:** only workflows in `COMPLETED`, `FAILED`, or `TERMINATED` state can be purged.
Design a retention policy: purge immediately after result consumption, or run a
scheduled cleanup job that purges instances older than N days.

---

## Assuming Exactly-Once Activity Execution

**The Problem**

Developers sometimes assume that because Dapr handles retries, each activity runs exactly
once. The actual guarantee is **at-least-once**: a worker crash after an activity
completes but before the result is persisted will cause the activity to run again on the
next worker.

**Symptoms**

- Side effects in activities (emails, payments, notifications) occurring more than once
  even though the workflow has no explicit retry policy
- Database constraints failing on duplicate inserts after a worker restart
- Confusion when idempotency bugs surface only under load or during deployments

**The Fix**

Treat every activity as if it may execute more than once. Design activities to be
**idempotent**: running them twice with the same input produces the same observable
result.

Strategies:
- Use idempotency keys with external APIs (see the Non-Idempotent Activities gotcha)
- Use upsert semantics instead of insert when writing to databases
- Check whether work was already done before doing it again:

```go
func SendEmailActivity(ctx workflow.ActivityContext) (any, error) {
    var req EmailRequest
    ctx.GetInput(&req)

    // Check idempotency — was this email already sent?
    sent, _ := emailTracker.WasSent(req.IdempotencyKey)
    if sent {
        return nil, nil // already done, safe to skip
    }
    return emailClient.Send(req)
}
```

---

## Multiple Workers with Different Code

**The Problem**

During a rolling deployment, some worker pods run the old code and some run the new code.
If a workflow is partially executed on an old worker and then replayed on a new worker
that has different command sequences, replay diverges.

**Symptoms**

- Non-determinism errors appearing in logs immediately after a deployment
- Errors mentioning "unexpected action" or "sequence number mismatch"
- Only some workflow instances failing (those that happened to migrate between old and new
  workers)
- Errors resolving themselves once the rollout completes (because old workers are gone)

**The Fix**

Choose a versioning strategy before deploying breaking changes:

- **Blue/Green:** drain all open instances before deploying (simplest, requires downtime
  or traffic routing).
- **New workflow type:** register `OrderWorkflowV2` alongside `OrderWorkflow`; route new
  starts to v2 only.
- **Named versioning** (Go SDK): use `AddVersionedWorkflowN` to pin in-flight instances
  to their original version while new instances use the latest.
- **Patching** (Go SDK): use `ctx.IsPatched` for minor in-place changes.

During development (not production), the fastest resolution is to terminate stale
in-flight instances before deploying:

```bash
# Find and terminate stale instances (dev/test only)
dapr workflow list --app-id myapp --filter-status RUNNING --output json \
  | jq -r '.[].instanceID' \
  | xargs -I{} dapr workflow terminate {} --app-id myapp
```

See `references/core/versioning.md` for detailed strategy guidance.
