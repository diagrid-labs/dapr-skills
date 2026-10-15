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

See the **Minimal API form** in [`../dapr-shared/dotnet-workflow-endpoints.md`](../dapr-shared/dotnet-workflow-endpoints.md) for the full `Program.cs` and key points.

## Workflow Class

See [`../dapr-shared/dotnet-workflow-class.md`](../dapr-shared/dotnet-workflow-class.md) for the full example, key points, determinism rules, and workflow patterns.

## Activity Class

See [`../dapr-shared/dotnet-activity-class.md`](../dapr-shared/dotnet-activity-class.md) for the full example and key points.

## local.http

See [`../dapr-shared/dotnet-local-http.md`](../dapr-shared/dotnet-local-http.md) for the full example and key points.

## .gitignore

See [`../dapr-shared/dotnet-gitignore.md`](../dapr-shared/dotnet-gitignore.md) for instructions.

## Deeper reference

These are not needed to scaffold the project, but answer the questions that come next:

- [`../dapr-shared/references/core/patterns.md`](../dapr-shared/references/core/patterns.md) — the pattern catalogue.
- [`../dapr-shared/references/core/child-workflows.md`](../dapr-shared/references/core/child-workflows.md) — composing workflows.
- [`../dapr-shared/references/core/timers.md`](../dapr-shared/references/core/timers.md) — durable timers.
- [`../dapr-shared/references/core/external-events.md`](../dapr-shared/references/core/external-events.md) — human-in-the-loop and waiting.
- [`../dapr-shared/references/core/testing.md`](../dapr-shared/references/core/testing.md) — how to test a workflow.
- [`../dapr-shared/references/core/versioning.md`](../dapr-shared/references/core/versioning.md) — changing a workflow already in flight.
- [`../dapr-shared/references/core/gotchas.md`](../dapr-shared/references/core/gotchas.md) — the mistakes that bite first.
- [`../dapr-shared/references/core/troubleshooting.md`](../dapr-shared/references/core/troubleshooting.md) — diagnosing a stuck run.
- [`../dapr-shared/references/core/error-reference.md`](../dapr-shared/references/core/error-reference.md) — the error taxonomy.
- [`../dapr-shared/references/core/activity-patterns.md`](../dapr-shared/references/core/activity-patterns.md) — activity shapes.
- [`../dapr-shared/references/core/determinism.md`](../dapr-shared/references/core/determinism.md) — why replay constrains the workflow body.
- [`../dapr-shared/references/ops/monitoring.md`](../dapr-shared/references/ops/monitoring.md) — what to watch in production.
- [`../dapr-shared/references/ops/scaling.md`](../dapr-shared/references/ops/scaling.md) — scaling the workers.
- [`../dapr-shared/references/ops/state-store-selection.md`](../dapr-shared/references/ops/state-store-selection.md) — choosing a state store.
- [`../dapr-shared/references/ops/troubleshooting-ops.md`](../dapr-shared/references/ops/troubleshooting-ops.md) — operational failure modes.
- [`../dapr-shared/references/dotnet/dotnet.md`](../dapr-shared/references/dotnet/dotnet.md) — the dotnet SDK reference.
- [`../dapr-shared/references/dotnet/patterns.md`](../dapr-shared/references/dotnet/patterns.md) — patterns in dotnet.
- [`../dapr-shared/references/dotnet/determinism.md`](../dapr-shared/references/dotnet/determinism.md) — determinism in dotnet.
- [`../dapr-shared/references/dotnet/error-handling.md`](../dapr-shared/references/dotnet/error-handling.md) — error handling in dotnet.
- [`../dapr-shared/references/dotnet/data-handling.md`](../dapr-shared/references/dotnet/data-handling.md) — data handling in dotnet.
- [`../dapr-shared/references/dotnet/gotchas.md`](../dapr-shared/references/dotnet/gotchas.md) — dotnet gotchas.
- [`../dapr-shared/references/dotnet/testing.md`](../dapr-shared/references/dotnet/testing.md) — testing in dotnet.

## Running Locally

See [`../dapr-shared/running-locally-dapr.md`](../dapr-shared/running-locally-dapr.md) for instructions.

## Running with Diagrid Catalyst

See [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md) for instructions.
