# Reference: Review Dapr Workflow — Determinism

This skill is read-only and operates entirely on existing source. The detailed rule tables live in the per-language checklist shards in `.claude/skills/shared/`.

## Source rule corpus

The canonical rule sources for this skill are the determinism sections of the existing authoring skills:

- [`../shared/dotnet-workflow-class.md`](../shared/dotnet-workflow-class.md) — section "Workflow determinism".
- [`../create-workflow-python/REFERENCE.md`](../create-workflow-python/REFERENCE.md) — section "Workflow determinism".

The per-language checklist shards translate those rules into greppable patterns and stable rule ids:

- [`../shared/review-determinism-dotnet.md`](../shared/review-determinism-dotnet.md)
- [`../shared/review-determinism-python.md`](../shared/review-determinism-python.md)

## Worked example

Given this .NET workflow:

```csharp
internal sealed class OrderWorkflow : Workflow<OrderInput, OrderResult>
{
    public override async Task<OrderResult> RunAsync(WorkflowContext context, OrderInput input)
    {
        var startedAt = DateTime.UtcNow;                     // DWF-DET-001
        var correlationId = Guid.NewGuid();                  // DWF-DET-002
        using var http = new HttpClient();                   // DWF-DET-006
        var resp = await http.GetStringAsync(input.LookupUrl); // I/O in workflow scope

        return await context.CallActivityAsync<OrderResult>(nameof(ProcessOrderActivity), input);
    }
}
```

The expected report excerpt:

```text
## Critical
- [DWF-DET-001] `Workflows/OrderWorkflow.cs:5` — `DateTime.UtcNow` used inside RunAsync
  Why: non-deterministic, breaks replay.
  Fix: use `context.CurrentUtcDateTime`.
- [DWF-DET-002] `Workflows/OrderWorkflow.cs:6` — `Guid.NewGuid()` used inside RunAsync
  Why: produces a different value on each replay.
  Fix: use `context.NewGuid()`.
- [DWF-DET-006] `Workflows/OrderWorkflow.cs:7` — `HttpClient` constructed inside RunAsync
  Why: direct I/O inside a workflow runs once per replay.
  Fix: move the call into an activity invoked via `context.CallActivityAsync`.
```

## Out of scope

- Activity bodies — covered by `review-workflow-activity`.
- Management endpoints / `Program.cs` / `main.py` — covered by `review-workflow-management`.
- Versioning, error handling, ops, and patterns — Phase 2 / 3 in `docs/review-skills-plan.md`.
