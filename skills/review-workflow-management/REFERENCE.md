# Reference: Review Dapr Workflow — Management Endpoints

This skill is read-only and operates entirely on existing source. The detailed rule tables live in the per-language checklist shards in [`../dapr-shared/`](../dapr-shared/).

## Source rule corpus

The canonical baseline for the management surface comes from the existing authoring skills:

- `Program.cs` example in [the canonical endpoints in `dotnet-workflow-endpoints.md`](../dapr-shared/dotnet-workflow-endpoints.md).
- `main.py` example in [`../create-workflow-python/REFERENCE.md`](../create-workflow-python/REFERENCE.md).
- The controller in [`../dapr-shared/java-workflow-endpoints.md`](../dapr-shared/java-workflow-endpoints.md).
- Request shapes in [`../dapr-shared/dotnet-local-http.md`](../dapr-shared/dotnet-local-http.md), [`../dapr-shared/python-local-http.md`](../dapr-shared/python-local-http.md) and [`../dapr-shared/java-local-http.md`](../dapr-shared/java-local-http.md).

The per-language checklist shards translate those expectations into greppable patterns and stable rule ids:

- [`../dapr-shared/review-management-dotnet.md`](../dapr-shared/review-management-dotnet.md)
- [`../dapr-shared/review-management-python.md`](../dapr-shared/review-management-python.md)
- [`../dapr-shared/review-management-java.md`](../dapr-shared/review-management-java.md)

## Worked example

Given this trimmed `Program.cs`:

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprWorkflow();
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
- [DWF-MGT-007] `Program.cs:8` — `/start` hard-codes the instanceId
  Why: concurrent calls clash on the same id; restarts collide with prior runs.
  Fix: accept the id from the request body or generate a fresh `Guid.NewGuid()`.
- [DWF-MGT-008] `Program.cs:9` — `/start` does not return the instanceId in the response body
  Why: callers cannot poll status.
  Fix: return `Results.Ok(new { instanceId = id })`.
```

## Java worked example

Given this status handler in a Spring `@RestController`:

```java
@GetMapping("/status/{instanceId}")
public ResponseEntity<?> status(@PathVariable String instanceId) {
  WorkflowInstanceStatus status = workflowClient.getInstanceState(instanceId, true);   // DWF-MGT-016
  return ResponseEntity.ok(status);
}
```

The expected report excerpt:

```text
## Warnings
- [DWF-MGT-016] `ShipmentController.java:3` — `getInstanceState` is deprecated for removal in SDK 1.19
  Why: it and `WorkflowInstanceStatus` are slated for removal; the handler breaks on the next SDK upgrade.
  Fix: call `getWorkflowState(instanceId, true)` and return 404 when the state is null or its workflow id is empty.
```

The same handler is also reported under DWF-MGT-009 (no existence check) and DWF-MGT-014 (raw SDK type as the response).

## Out of scope

- Workflow body code (`Workflow<>` `RunAsync`, `@wfr.workflow` functions, the Java `WorkflowStub`) — covered by `review-workflow-determinism`.
- Activity code — covered by `review-workflow-activity`.
- Workflow versioning (`IsPatched` / `is_patched` and named workflow versions), error-handling policy, operations, and pattern-level design reviews — not covered by the review skills.
