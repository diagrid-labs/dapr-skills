# Reference: Review Dapr Workflow — Management Endpoints

This skill is read-only and operates entirely on existing source. The detailed rule tables live in the per-language checklist shards in `.claude/skills/shared/`.

## Source rule corpus

The canonical baseline for the management surface comes from the existing authoring skills:

- `Program.cs` example in [`../create-workflow-dotnet/REFERENCE.md`](../create-workflow-dotnet/REFERENCE.md).
- `main.py` example in [`../create-workflow-python/REFERENCE.md`](../create-workflow-python/REFERENCE.md).
- Request shapes in [`../shared/dotnet-local-http.md`](../shared/dotnet-local-http.md) and [`../shared/python-local-http.md`](../shared/python-local-http.md).

The per-language checklist shards translate those expectations into greppable patterns and stable rule ids:

- [`../shared/review-management-dotnet.md`](../shared/review-management-dotnet.md)
- [`../shared/review-management-python.md`](../shared/review-management-python.md)

## Worked example

Given this trimmed `Program.cs`:

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprWorkflow(o => o.RegisterActivity<ChargeCardActivity>());
builder.Services.AddDaprWorkflowVersioning();
var app = builder.Build();

app.MapPost("/start", async ([FromServices] DaprWorkflowClient client, [FromBody] OrderInput input) =>
{
    var id = await client.ScheduleNewWorkflowAsync(nameof(OrderWorkflow), instanceId: "fixed-id", input);
    return Results.Ok();   // DWF-MGT-008 (no instanceId returned)
});

// no /status, no /terminate, no /pause, no /resume

app.Run();
```

The expected report excerpt:

```text
## Critical
- [DWF-MGT-002] `Program.cs` — No GET /status/{instanceId} endpoint found
  Why: operators cannot inspect workflow state.
  Fix: add a `MapGet("/status/{instanceId}", ...)` endpoint that calls `GetWorkflowStateAsync`.
- [DWF-MGT-003] `Program.cs` — No endpoint calls TerminateWorkflowAsync
  Why: stuck workflows cannot be cancelled without redeploying.
  Fix: add a `MapPost("/terminate/{instanceId}", ...)` endpoint.

## Warnings
- [DWF-MGT-004] `Program.cs` — No endpoint calls SuspendWorkflowAsync
  Why: no way to pause a workflow during incident response.
  Fix: add a `MapPost("/pause/{instanceId}", ...)` endpoint.
- [DWF-MGT-005] `Program.cs` — No endpoint calls ResumeWorkflowAsync
  Why: suspended workflows cannot be resumed.
  Fix: add a `MapPost("/resume/{instanceId}", ...)` endpoint.
- [DWF-MGT-007] `Program.cs:7` — `/start` hard-codes the instanceId
  Why: concurrent calls clash on the same id; restarts collide with prior runs.
  Fix: accept the id from the request body or generate a fresh `Guid.NewGuid()`.
- [DWF-MGT-008] `Program.cs:9` — `/start` does not return the instanceId in the response body
  Why: callers cannot poll status.
  Fix: return `Results.Ok(new { instanceId = id })`.
```

## Out of scope

- Workflow body code (`Workflow<>` `RunAsync`, `@wfr.workflow` functions) — covered by `review-workflow-determinism`.
- Activity code — covered by `review-workflow-activity`.
- Versioning, error-handling policy, ops, and patterns — Phase 2 / 3 in `docs/review-skills-plan.md`.
