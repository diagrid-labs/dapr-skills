# Child Workflows

## Overview

Child workflows (also called sub-orchestrations) let a parent workflow schedule other
registered workflows as tasks, waiting for their results just like activities. Each child
workflow is a fully independent workflow instance: it has its own instance ID, its own
event-sourced history, and its own status tracked by the Dapr runtime.

Parent and child workflows communicate only through inputs and return values — there is no
shared in-memory state between them. This makes child workflows a natural boundary for
breaking large orchestrations into cohesive, independently testable units.

## Independent Histories

Because every child workflow maintains its own history log, replay for the child is
completely isolated from replay for the parent. This has two practical implications:

1. **History size stays manageable.** A parent that fans out to 100 children records only
   100 schedule + completion events, not the thousands of activity steps those children
   might perform internally.
2. **Failures are scoped.** A child that fails surfaces a single error event in the
   parent's history, just like a failed activity. The parent can catch that error, retry
   the child with a retry policy, or compensate — without seeing the child's internal
   stack.

The Go SDK wires this up through `ctx.CallSubOrchestrator`:

```go
// Parent workflow
func ParentWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var childResult string
    err := ctx.CallSubOrchestrator(ChildWorkflow,
        workflow.WithSubOrchestratorInput(MyInput{...}),
        workflow.WithSubOrchestrationInstanceID("child-001"),
    ).Await(&childResult)
    if err != nil {
        return nil, fmt.Errorf("child failed: %w", err)
    }
    return childResult, nil
}

// Child workflow — registered and runs independently
func ChildWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var result string
    err := ctx.CallActivity(DoWork, workflow.WithActivityInput(...)).Await(&result)
    return result, err
}
```

The child instance ID can be set explicitly (useful for idempotency) or left unset, in
which case the runtime assigns a deterministic ID derived from the parent.

## Parent-Child Lifecycle

The parent awaits the child's Task; if the child succeeds the parent receives its output.
If the child fails, the error propagates to the parent's `Await` call.

**Recursive termination:** terminating a parent workflow via
`client.TerminateWorkflow(ctx, parentID, ...)` also terminates all child workflows it
created. Pass `workflow.WithRecursiveTerminate(true)` to be explicit, or
`WithRecursiveTerminate(false)` to leave children running after the parent is gone.
Similarly, `PurgeWorkflow` accepts `WithRecursivePurge(true)` to clean up the entire tree.

```go
// Terminate parent and all its children
err := client.TerminateWorkflow(ctx, "parent-001",
    workflow.WithRecursiveTerminate(true))
```

Child workflows also support the same durable retry policies as activities:

```go
ctx.CallSubOrchestrator(ChildWorkflow,
    workflow.WithSubOrchestratorInput(input),
    workflow.WithSubOrchestrationRetryPolicy(&workflow.RetryPolicy{
        MaxAttempts:          3,
        InitialRetryInterval: 5 * time.Second,
        BackoffCoefficient:   2.0,
    }),
).Await(&result)
```

## When to Use

| Scenario | Recommendation |
|----------|----------------|
| Workflow logic exceeds ~100 activity steps | Extract phases into child workflows |
| A sub-process is reused by multiple parent workflows | Factor it into a standalone child workflow |
| You want to isolate failure domains | Each child can fail/retry independently |
| You need to fan out to N independent processes concurrently | Launch N child workflows in parallel |
| History size is growing large | Move work into children; parent history shrinks |

Avoid child workflows when the overhead of a separate instance is not worth it — for a
simple two-step sequence, a plain activity is sufficient.

## Fan-out to N Children Pattern

Start N children concurrently, collect all results. Because each child is a separate
instance, the work can be distributed across multiple worker pods automatically.

```go
func FanOutWorkflow(ctx *workflow.WorkflowContext) (any, error) {
    var items []WorkItem
    if err := ctx.GetInput(&items); err != nil {
        return nil, err
    }

    // Schedule all children without awaiting yet
    tasks := make([]workflow.Task, len(items))
    for i, item := range items {
        tasks[i] = ctx.CallSubOrchestrator(ProcessItem,
            workflow.WithSubOrchestratorInput(item),
            workflow.WithSubOrchestrationInstanceID(
                fmt.Sprintf("process-%s-%d", ctx.ID, i),
            ),
        )
    }

    // Collect results
    results := make([]string, len(items))
    for i, t := range tasks {
        if err := t.Await(&results[i]); err != nil {
            return nil, fmt.Errorf("item %d failed: %w", i, err)
        }
    }
    return results, nil
}
```

This pattern keeps the parent history small (2N events) regardless of how many activities
each child performs internally.

## Related

- `references/core/patterns.md` — fan-out/fan-in and other composition patterns
- `references/core/timers.md` — ContinueAsNew for unbounded work without child workflows
- `references/core/gotchas.md` — Scheduling Thousands of Tasks pitfall
