# Dapr Workflow management endpoints (.NET)

These endpoints are the canonical management surface used by the `create-workflow-*` and `add-workflow-dotnet` skills and checked by `review-workflow-management`.

## Minimal API form

Call `AddDaprWorkflow()` to register the Dapr Workflow runtime. As of Dapr 1.18 the .NET SDK auto-registers all workflow and activity classes, so the method takes no arguments. Call `AddDaprWorkflowVersioning()` to enable name-based workflow versioning. Use `DaprWorkflowClient` to manage workflow instances.

```csharp
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Dapr.Workflow;
using Dapr.Workflow.Versioning;
using <ProjectNamespace>.Models;
using <ProjectNamespace>.Workflows;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprWorkflow();
builder.Services.AddDaprWorkflowVersioning();

var app = builder.Build();

app.MapPost("/start", async (
    [FromServices] DaprWorkflowClient workflowClient,
    [FromBody] WorkflowInput workflowInput) =>
{
    var instanceId = await workflowClient.ScheduleNewWorkflowAsync(
        name: nameof(MyWorkflow),
        instanceId: workflowInput.Id,
        input: workflowInput);

    return Results.Ok(new {instanceId});
});

app.MapGet("/status/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId);
    if (!state.Exists)
    {
        return Results.NotFound($"Workflow instance '{instanceId}' not found.");
    }

    var output = state.ReadOutputAs<WorkflowOutput>();
    return Results.Ok(new {state, output});
});

app.MapPost("pause/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.SuspendWorkflowAsync(instanceId);
    return Results.Accepted();
});

app.MapPost("resume/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.ResumeWorkflowAsync(instanceId);
    return Results.Accepted();
});

app.MapPost("terminate/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.TerminateWorkflowAsync(instanceId);
    return Results.Accepted();
});

// Only add this endpoint when a workflow calls WaitForExternalEventAsync.
app.MapPost("raise-event/{instanceId}/{eventName}", async (
    [FromRoute] string instanceId,
    [FromRoute] string eventName,
    [FromBody] JsonElement eventPayload,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId);
    if (!state.Exists)
    {
        return Results.NotFound($"Workflow instance '{instanceId}' not found.");
    }

    await workflowClient.RaiseEventAsync(instanceId, eventName, eventPayload);
    return Results.Accepted();
});

app.Run();
```

### Key points (minimal API)

- `AddDaprWorkflow()` registers the Dapr Workflow runtime and services with the DI container. As of Dapr 1.18 all workflow and activity classes are auto-registered, so no `RegisterWorkflow`/`RegisterActivity` calls are needed.
- `AddDaprWorkflowVersioning()` enables name-based workflow versioning (part of the `Dapr.Workflow` package as of 1.18; no separate `Dapr.Workflow.Versioning` package is required).
- `DaprWorkflowClient` is injected via DI and used to schedule new workflow instances.
- `ScheduleNewWorkflowAsync` starts a new workflow instance and returns the instance ID. Pass a model record as input.
- `GetWorkflowStateAsync` retrieves the current status of a workflow instance by its instance ID. It never returns `null`; when the instance does not exist it returns a state with `Exists == false`, so check `state.Exists`.
- Use `state.ReadOutputAs<TOutput>()` to deserialize the workflow output from the state. The `TOutput` type must match the workflow's output type (e.g., `WorkflowOutput`). Return both `state` and `output` in the response.
- The `/start` endpoint binds the request body to `WorkflowInput` (the workflow's input type) and uses `WorkflowInput.Id` as the instance ID. The `[FromBody]` type must match the workflow's `TInput`, otherwise the `DAPR1303` analyzer reports an input type mismatch.
- Add `using` directives for the `Models` and `Workflows` namespaces. Activities are referenced only from workflow classes, so `Program.cs` does not need the `Activities` namespace.
- The `raise-event` endpoint is only needed when a workflow calls `WaitForExternalEventAsync` (e.g. the human-in-the-loop pattern). The body is bound as a `JsonElement` and forwarded as-is, so one endpoint serves any event; the workflow deserializes it into the type passed to `WaitForExternalEventAsync<T>`. Remove the endpoint (and the `System.Text.Json` using) otherwise. `RaiseEventAsync` silently drops events for unknown instances, so the endpoint checks `state.Exists` first.

## Adding to an existing Program.cs

- Add `builder.Services.AddDaprWorkflow();` (and `AddDaprWorkflowVersioning();`) once, directly after the last existing `builder.Services.*` call. Never add a second `AddDaprWorkflow()`. Keep existing Dapr registrations such as `AddDaprClient()` and `AddControllers().AddDapr()`; `AddDaprWorkflow()` is added alongside them, not instead of them.
- Map the workflow endpoints after the last existing `app.Map*` call and before `app.Run()`, under a `/workflows/<workflow-route>` group (`var <workflowVar> = app.MapGroup("/workflows/<workflow-route>");`, then `<workflowVar>.MapPost("/start", ...)` and so on) so they cannot collide with the project's own routes. Root-level `/start` and `/status` are only for new projects.
- `Startup.cs` hosts: put the registrations in `ConfigureServices(IServiceCollection services)` as `services.AddDaprWorkflow();` and `services.AddDaprWorkflowVersioning();`, and the endpoints inside the existing `app.UseEndpoints(endpoints => { ... })` under `endpoints.MapGroup("/workflows/<workflow-route>")`. The `using` directives below go in `Startup.cs`, not `Program.cs`, and `Program.cs` stays unchanged.
- Keep existing `using` directives; add only `Dapr.Workflow`, `Dapr.Workflow.Versioning`, and the project's own `Models`/`Workflows` namespaces when they are not covered by global usings.

## Starting the workflow from an existing endpoint

Use this when the user agreed that an existing endpoint (for example `POST /orders`) should also start the workflow. Change only that handler; keep its route, its existing work and its response.

Minimal API — add a `DaprWorkflowClient` parameter, make the handler `async` if it is not, and schedule the workflow after the existing work succeeded:

```csharp
app.MapPost("/orders", async (Order order, OrderService orders, DaprWorkflowClient workflowClient) =>
{
    var created = orders.Add(order);

    await workflowClient.ScheduleNewWorkflowAsync(
        name: nameof(PlaceOrderWorkflow),
        instanceId: created.Id,
        input: new PlaceOrderInput(created));

    return Results.Created($"/orders/{created.Id}", created);
});
```

Controller — add `DaprWorkflowClient workflowClient` to the constructor (primary constructor parameter or field, following the class), then schedule after the existing work:

```csharp
[HttpPost]
public async Task<IActionResult> Create([FromBody] Invoice invoice)
{
    await dapr.SaveStateAsync(StoreName, invoice.Id, invoice);

    await workflowClient.ScheduleNewWorkflowAsync(
        name: nameof(InvoiceReminderWorkflow),
        instanceId: invoice.Id,
        input: new InvoiceReminderInput(invoice.Id));

    return CreatedAtAction(nameof(Get), new { id = invoice.Id }, invoice);
}
```

### Key points

- Schedule only after the existing work succeeded, so a rejected request (validation error, exception) never starts a workflow.
- Use the entity's own id as the instance id. The workflow's status is then at `/workflows/<workflow-route>/status/<entity id>` and a retried request cannot start a second instance for the same entity.
- Keep the status code and body exactly as they were; clients of the existing endpoint must not notice the change apart from the workflow running.
- The endpoint now needs the Dapr sidecar. Integration tests that call it over HTTP need a running sidecar or a substituted `DaprWorkflowClient`; that is why the default answer to the question is "no" when such tests exist.
- `Startup.cs` hosts: the same change inside `UseEndpoints`, or in the controller.

## Controller form

```csharp
using System.Text.Json;
using Dapr.Workflow;
using Microsoft.AspNetCore.Mvc;
using <ProjectNamespace>.Models;
using <ProjectNamespace>.Workflows;

namespace <ProjectNamespace>.Controllers;

[ApiController]
[Route("workflows/<workflow-route>")]
public sealed class <WorkflowName>Controller(DaprWorkflowClient workflowClient) : ControllerBase
{
    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] <WorkflowInput> input)
    {
        var instanceId = await workflowClient.ScheduleNewWorkflowAsync(
            name: nameof(<WorkflowName>),
            instanceId: input.Id,
            input: input);
        return Ok(new { instanceId });
    }

    [HttpGet("status/{instanceId}")]
    public async Task<IActionResult> Status(string instanceId)
    {
        var state = await workflowClient.GetWorkflowStateAsync(instanceId);
        if (!state.Exists)
        {
            return NotFound($"Workflow instance '{instanceId}' not found.");
        }

        var output = state.ReadOutputAs<<WorkflowOutput>>();
        return Ok(new { state, output });
    }

    [HttpPost("pause/{instanceId}")]
    public async Task<IActionResult> Pause(string instanceId)
    {
        await workflowClient.SuspendWorkflowAsync(instanceId);
        return Accepted();
    }

    [HttpPost("resume/{instanceId}")]
    public async Task<IActionResult> Resume(string instanceId)
    {
        await workflowClient.ResumeWorkflowAsync(instanceId);
        return Accepted();
    }

    [HttpPost("terminate/{instanceId}")]
    public async Task<IActionResult> Terminate(string instanceId)
    {
        await workflowClient.TerminateWorkflowAsync(instanceId);
        return Accepted();
    }

    // Only add this action when a workflow calls WaitForExternalEventAsync.
    [HttpPost("raise-event/{instanceId}/{eventName}")]
    public async Task<IActionResult> RaiseEvent(string instanceId, string eventName, [FromBody] JsonElement payload)
    {
        var state = await workflowClient.GetWorkflowStateAsync(instanceId);
        if (!state.Exists)
        {
            return NotFound($"Workflow instance '{instanceId}' not found.");
        }

        await workflowClient.RaiseEventAsync(instanceId, eventName, payload);
        return Accepted();
    }
}
```

### Key points (controller)

- The primary constructor needs C# 12 (default on net8+). Use the project's existing controller folder and namespace; when the project's controllers use a constructor body instead of primary constructors, follow that style.
- The `[FromBody]` type must match the workflow `TInput` (`DAPR1303`).
- The same `state.Exists` and `{ state, output }` rules as the minimal API form apply.
