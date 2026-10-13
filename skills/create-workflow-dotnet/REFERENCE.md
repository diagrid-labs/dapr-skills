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

## Running Locally

See [`../dapr-shared/running-locally-dapr.md`](../dapr-shared/running-locally-dapr.md) for instructions.

## Running with Diagrid Catalyst

See [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md) for instructions.
