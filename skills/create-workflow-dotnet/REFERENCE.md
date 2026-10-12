# Reference: Dapr Workflow .NET Application

## dapr.yaml

Create a `dapr.yaml` multi-app run file in the project root. This file configures the Dapr sidecar and points to the resources folder.

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
apps:
  - appID: <app-id>
    appDirPath: <ProjectName>
    appPort: <app-port>
    daprHTTPPort: 3555
    command: ["dotnet", "run"]
```

- `resourcesPath` points to the folder containing Dapr component definitions.
- `appDirPath` is the folder containing the .NET project.
- Use `dapr run -f dapr.yaml` to start the application with the Dapr sidecar.

## resources/statestore.yaml

See [`../dapr-shared/dapr-statestore.md`](../dapr-shared/dapr-statestore.md) for the full example and key points.

## Properties/launchSettings.json

The application port must match the `appPort` specified in `dapr.yaml`. Create a `Properties/launchSettings.json` file in the project folder:

```json
{
  "$schema": "https://json.schemastore.org/launchsettings.json",
  "profiles": {
    "http": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "applicationUrl": "http://localhost:<app-port>",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development"
      }
    }
  }
}
```

- The `applicationUrl` port (<app-port>) must match the `appPort` in `dapr.yaml`.

## .csproj

The `.csproj` file should look like this:

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Dapr.Workflow" Version="1.18.10" />
  </ItemGroup>

</Project>
```

## Models

See [`../dapr-shared/dotnet-models.md`](../dapr-shared/dotnet-models.md) for the full example and key points.

## Program.cs

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

### Key points

- `AddDaprWorkflow()` registers the Dapr Workflow runtime and services with the DI container. As of Dapr 1.18 all workflow and activity classes are auto-registered, so no `RegisterWorkflow`/`RegisterActivity` calls are needed.
- `AddDaprWorkflowVersioning()` enables name-based workflow versioning (part of the `Dapr.Workflow` package as of 1.18; no separate `Dapr.Workflow.Versioning` package is required).
- `DaprWorkflowClient` is injected via DI and used to schedule new workflow instances.
- `ScheduleNewWorkflowAsync` starts a new workflow instance and returns the instance ID. Pass a model record as input.
- `GetWorkflowStateAsync` retrieves the current status of a workflow instance by its instance ID. It never returns `null`; when the instance does not exist it returns a state with `Exists == false`, so check `state.Exists`.
- Use `state.ReadOutputAs<TOutput>()` to deserialize the workflow output from the state. The `TOutput` type must match the workflow's output type (e.g., `WorkflowOutput`). Return both `state` and `output` in the response.
- The `/start` endpoint binds the request body to `WorkflowInput` (the workflow's input type) and uses `WorkflowInput.Id` as the instance ID. The `[FromBody]` type must match the workflow's `TInput`, otherwise the `DAPR1303` analyzer reports an input type mismatch.
- Add `using` directives for the `Models` and `Workflows` namespaces. Activities are referenced only from workflow classes, so `Program.cs` does not need the `Activities` namespace.
- The `raise-event` endpoint is only needed when a workflow calls `WaitForExternalEventAsync` (e.g. the human-in-the-loop pattern). The body is bound as a `JsonElement` and forwarded as-is, so one endpoint serves any event; the workflow deserializes it into the type passed to `WaitForExternalEventAsync<T>`. Remove the endpoint (and the `System.Text.Json` using) otherwise. `RaiseEventAsync` silently drops events for unknown instances, so the endpoint checks `state.Exists` first.

## Workflow Class

See [`../dapr-shared/dotnet-workflow-class.md`](../dapr-shared/dotnet-workflow-class.md) for the full example, key points, determinism rules, and workflow patterns.

## Activity Class

See [`../dapr-shared/dotnet-activity-class.md`](../dapr-shared/dotnet-activity-class.md) for the full example and key points.

## local.http

See [`../dapr-shared/dotnet-local-http.md`](../dapr-shared/dotnet-local-http.md) for the full example and key points.

## .gitignore

See [`../dapr-shared/dotnet-gitignore.md`](../dapr-shared/dotnet-gitignore.md) for instructions.

## Running Locally

See [`../dapr-shared/running-locally-dapr.md`](../dapr-shared/running-locally-dapr.md) for instructions.

## Running with Diagrid Catalyst

See [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md) for instructions.
