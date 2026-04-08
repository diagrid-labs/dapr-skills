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

See [`../shared/dapr-statestore.md`](../shared/dapr-statestore.md) for the full example and key points.

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
    <PackageReference Include="Dapr.Workflow" Version="1.17.8" />
    <PackageReference Include="Dapr.Workflow.Versioning" Version="1.17.8" />
  </ItemGroup>

</Project>
```

## Models

See [`../shared/dotnet-models.md`](../shared/dotnet-models.md) for the full example and key points.

## Program.cs

Use `AddDaprWorkflow` to register activity types. Use `AddDaprWorkflowVersioning` to auto-register workflow types and enable workflow versioning. Use `DaprWorkflowClient` to manage workflow instances.

```csharp
using Microsoft.AspNetCore.Mvc;
using Dapr.Workflow;
using Dapr.Workflow.Versioning;
using <ProjectNamespace>;
using <ProjectNamespace>.Activities;
using <ProjectNamespace>.Models;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterActivity<MyActivity>();
});
builder.Services.AddDaprWorkflowVersioning();

var app = builder.Build();

app.MapPost("/start", async (
    [FromServices] DaprWorkflowClient workflowClient,
    [FromBody] MyWorkflowInput workflowInput) =>
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

app.Run();
```

### Key points

- `AddDaprWorkflow` registers the Dapr Workflow services and the workflow/activity types with the DI container.
- `AddDaprWorkflowVersioning` auto registers workflow classes and enables name based versioning.
- `RegisterActivity<T>()` registers an activity class. Register each activity separately.
- `DaprWorkflowClient` is injected via DI and used to schedule new workflow instances.
- `ScheduleNewWorkflowAsync` starts a new workflow instance and returns the instance ID. Pass a model record as input.
- `GetWorkflowStateAsync` retrieves the current status of a workflow instance by its instance ID. Check `state.Exists` to verify the instance was found.
- Use `state.ReadOutputAs<TOutput>()` to deserialize the workflow output from the state. The `TOutput` type must match the workflow's output type (e.g., `WorkflowOutput`). Return both `state` and `output` in the response.
- Add `using` directives for the namespaces containing the workflow, activity, and model classes.

## Workflow Class

See [`../shared/dotnet-workflow-class.md`](../shared/dotnet-workflow-class.md) for the full example, key points, determinism rules, and workflow patterns.

## Activity Class

See [`../shared/dotnet-activity-class.md`](../shared/dotnet-activity-class.md) for the full example and key points.

## local.http

See [`../shared/dotnet-local-http.md`](../shared/dotnet-local-http.md) for the full example and key points.

## .gitignore

See [`../shared/dotnet-gitignore.md`](../shared/dotnet-gitignore.md) for instructions.

## Running Locally

See [`../shared/running-locally-dapr.md`](../shared/running-locally-dapr.md) for instructions.

## Running with Diagrid Catalyst

See [`../shared/running-with-catalyst.md`](../shared/running-with-catalyst.md) for instructions.
