# Reference: Dapr Workflow .NET Aspire Application

## AppHost.cs

The AppHost orchestrates all resources: Dapr, Valkey cache, the ApiService with a Dapr sidecar, and the Diagrid Dashboard.

```csharp
using System.Reflection;
using CommunityToolkit.Aspire.Hosting.Dapr;

var builder = DistributedApplication.CreateBuilder(args);

builder.AddDapr();

string executingPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)
    ?? throw new("Where am I?");

var cachePassword = builder.AddParameter("cache-password", "state-store-123", secret: true);
var cache = builder
    .AddValkey("cache", 16379, cachePassword)
    .WithContainerName("workflow-state")
    .WithDataVolume("workflow-state-data");

var apiService = builder
    .AddProject<Projects.<SolutionRoot>_ApiService>("apiservice")
    .WithDaprSidecar(new DaprSidecarOptions
    {
        LogLevel = "debug",
        ResourcesPaths =
        [
            Path.Join(executingPath, "Resources"),
        ],
    });

apiService.WaitFor(cache);

builder
    .AddContainer("diagrid-dashboard", "ghcr.io/diagridio/diagrid-dashboard:latest")
    .WithContainerName("diagrid-dashboard")
    .WithBindMount(Path.Join(executingPath, "Resources"), "/app/components")
    .WithEnvironment("COMPONENT_FILE", "/app/components/statestore-dashboard.yaml")
    .WithEnvironment("APP_ID", "diagrid-dashboard")
    .WithHttpEndpoint(targetPort: 8080)
    .WithReference(cache);

builder.Build().Run();
```

### Key points

- `AddDapr()` registers the Dapr hosting integration with Aspire.
- `AddValkey("cache", 16379, cachePassword)` creates a Valkey container on port 16379, replacing the Redis that `dapr init` would normally provide.
- `WithDaprSidecar()` attaches a Dapr sidecar to the ApiService. The `ResourcesPaths` option points to the `Resources` folder containing component YAML files.
- `apiService.WaitFor(cache)` ensures the Valkey container is ready before the ApiService starts.
- The Diagrid Dashboard is added as a generic container resource with a bind mount to the Resources folder so it can read the state store component file.
- `host.docker.internal` is used in `statestore-dashboard.yaml` because the dashboard container needs to reach Valkey running on the host network.
- Replace `<SolutionRoot>` with the actual solution name (e.g., `Projects.MyApp_ApiService`).

## AppHost .csproj

```xml
<Project Sdk="Aspire.AppHost.Sdk/13.2.1">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <UserSecretsId>auto-generated-id</UserSecretsId>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\<SolutionRoot>.ApiService\<SolutionRoot>.ApiService.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Aspire.Hosting.Valkey" Version="13.2.1" />
    <PackageReference Include="CommunityToolkit.Aspire.Hosting.Dapr" Version="13.0.0" />
  </ItemGroup>

  <ItemGroup>
    <Content Include="Resources\**\*.*">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
      <Link>Resources\%(RecursiveDir)%(Filename)%(Extension)</Link>
    </Content>
  </ItemGroup>

</Project>
```

### Key points

- Uses `Aspire.AppHost.Sdk/13.2.1` instead of the standard .NET SDK.
- `CommunityToolkit.Aspire.Hosting.Dapr` provides the `AddDapr()` and `WithDaprSidecar()` extension methods.
- `Aspire.Hosting.Valkey` provides the `AddValkey()` extension method.
- The `Content` item group copies the `Resources` folder (containing Dapr component YAML files) to the build output directory.
- Remove any project reference to the Web project that was deleted during scaffolding.

## Resources/statestore.yaml

State store component used by the workflow in ApiService:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: workflow-store
spec:
  type: state.redis
  version: v1
  metadata:
    - name: redisHost
      value: "localhost:16379"
    - name: redisPassword
      value: "state-store-123"
    - name: actorStateStore
      value: true
```

### Key points

- `redisHost` uses `localhost:16379` because the Dapr sidecar runs on the host and the Valkey container exposes port 16379.
- `redisPassword` must match the password configured in `AppHost.cs` via `AddParameter("cache-password", ...)`.
- `actorStateStore` must be `true` because Dapr Workflow uses the actor framework internally.
- The component name `workflow-store` is used by the Dapr runtime to identify this state store.

## Resources/statestore-dashboard.yaml

State store component used by the Diagrid Dashboard container:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: workflow-store
scopes:
  - diagrid-dashboard
spec:
  type: state.redis
  version: v1
  metadata:
    - name: redisHost
      value: "host.docker.internal:16379"
    - name: redisPassword
      value: "state-store-123"
    - name: actorStateStore
      value: true
```

### Key points

- `redisHost` uses `host.docker.internal:16379` instead of `localhost:16379` because the dashboard runs inside a Docker container and needs to reach the Valkey container exposed on the host.
- `scopes` restricts this component to only the `diagrid-dashboard` app ID, preventing conflicts with the apiservice state store component.
- The component name must match the one in `statestore.yaml` (`workflow-store`) so the dashboard can read workflow state.

## ApiService Program.cs

Use `AddDaprWorkflow` to register activity types. Use `AddDaprWorkflowVersioning` to enable workflow versioning and auto-register workflow types. Use `DaprWorkflowClient` to schedule workflow instances and query their status via HTTP endpoints. Use `AddServiceDefaults` to integrates with the Aspire ServiceDefaults:

```csharp
using Microsoft.AspNetCore.Mvc;
using Dapr.Workflow;
using Dapr.Workflow.Versioning;
using <ProjectNamespace>;
using <ProjectNamespace>.Activities;
using <ProjectNamespace>.Models;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

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
    if (state is null || !state.Exists)
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

app.MapDefaultEndpoints();

app.Run();
```

### Key points

- `builder.AddServiceDefaults()` adds OpenTelemetry, health checks, resilience, and service discovery from the ServiceDefaults project.
- `app.MapDefaultEndpoints()` maps the `/health` and `/alive` health check endpoints used by Aspire for orchestration.
- `AddDaprWorkflow` registers the Dapr Workflow services and the workflow/activity types with the DI container.
- `AddDaprWorkflowVersioning` registers the Dapr Workflow classes and allows to make breaking changes between workflows with disrupting in-flight workflows.
- `RegisterActivity<T>()` registers an activity class. Register each activity separately.
- `DaprWorkflowClient` is injected via DI and used to schedule new workflow instances.
- `ScheduleNewWorkflowAsync` starts a new workflow instance and returns the instance ID. Pass a model record as input.
- `GetWorkflowStateAsync` retrieves the current status of a workflow instance by its instance ID. Check `state.Exists` to verify the instance was found.
- Use `state.ReadOutputAs<TOutput>()` to deserialize the workflow output from the state. The `TOutput` type must match the workflow's output type (e.g., `WorkflowOutput`). Return both `state` and `output` in the response.
- Add `using` directives for the namespaces containing the workflow, activity, and model classes.

## ApiService .csproj

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\<SolutionRoot>.ServiceDefaults\<SolutionRoot>.ServiceDefaults.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Dapr.Workflow" Version="1.17.8" />
    <PackageReference Include="Dapr.Workflow.Versioning" Version="1.17.8" />
  </ItemGroup>

</Project>
```

### Key points

- References the ServiceDefaults project for shared Aspire configuration.
- Uses `Dapr.Workflow` version `1.17.8` for workflow support.
- No `Microsoft.AspNetCore.OpenApi` package is needed unless the user explicitly requests OpenAPI support.

## ServiceDefaults .csproj

Template-generated file — keep as scaffolded by `aspire new`:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsAspireSharedProject>true</IsAspireSharedProject>
  </PropertyGroup>

  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />

    <PackageReference Include="Microsoft.Extensions.Http.Resilience" Version="10.1.0" />
    <PackageReference Include="Microsoft.Extensions.ServiceDiscovery" Version="10.1.0" />
    <PackageReference Include="OpenTelemetry.Exporter.OpenTelemetryProtocol" Version="1.14.0" />
    <PackageReference Include="OpenTelemetry.Extensions.Hosting" Version="1.14.0" />
    <PackageReference Include="OpenTelemetry.Instrumentation.AspNetCore" Version="1.14.0" />
    <PackageReference Include="OpenTelemetry.Instrumentation.Http" Version="1.14.0" />
    <PackageReference Include="OpenTelemetry.Instrumentation.Runtime" Version="1.14.0" />
  </ItemGroup>

</Project>
```

### Key points

- `IsAspireSharedProject` marks this as an Aspire shared project.
- Includes OpenTelemetry packages for tracing, metrics, and logging.
- Includes resilience and service discovery packages.
- This file is generated by the Aspire template and should not need modifications.

## ServiceDefaults Extensions.cs

Template-generated file that adds OpenTelemetry, health checks, service discovery, and resilience. Keep as scaffolded by `aspire new`:

```csharp
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.ServiceDiscovery;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Microsoft.Extensions.Hosting;

public static class Extensions
{
    private const string HealthEndpointPath = "/health";
    private const string AlivenessEndpointPath = "/alive";

    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();

        builder.AddDefaultHealthChecks();

        builder.Services.AddServiceDiscovery();

        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            http.AddStandardResilienceHandler();
            http.AddServiceDiscovery();
        });

        return builder;
    }

    public static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddRuntimeInstrumentation();
            })
            .WithTracing(tracing =>
            {
                tracing.AddSource(builder.Environment.ApplicationName)
                    .AddAspNetCoreInstrumentation(tracing =>
                        tracing.Filter = context =>
                            !context.Request.Path.StartsWithSegments(HealthEndpointPath)
                            && !context.Request.Path.StartsWithSegments(AlivenessEndpointPath)
                    )
                    .AddHttpClientInstrumentation();
            });

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    private static TBuilder AddOpenTelemetryExporters<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        var useOtlpExporter = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);

        if (useOtlpExporter)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }

    public static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }

    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        if (app.Environment.IsDevelopment())
        {
            app.MapHealthChecks(HealthEndpointPath);

            app.MapHealthChecks(AlivenessEndpointPath, new HealthCheckOptions
            {
                Predicate = r => r.Tags.Contains("live")
            });
        }

        return app;
    }
}
```

### Key points

- `AddServiceDefaults()` is called in the ApiService `Program.cs` to add all shared Aspire services.
- `MapDefaultEndpoints()` maps `/health` and `/alive` endpoints used by Aspire to monitor service health.
- OpenTelemetry is configured for logging, metrics, and tracing with OTLP export.
- Health check endpoints are excluded from tracing to reduce noise.
- This file should not need modifications for Dapr Workflow support.

## Models

See [`../shared/dotnet-models.md`](../shared/dotnet-models.md) for the full example and key points.

## Workflow Class

See [`../shared/dotnet-workflow-class.md`](../shared/dotnet-workflow-class.md) for the full example, key points, determinism rules, and workflow patterns.

## Activity Class

See [`../shared/dotnet-activity-class.md`](../shared/dotnet-activity-class.md) for the full example and key points.

## <SolutionRoot>.ApiService.http

Update the existing `<SolutionRoot>.ApiService/<SolutionRoot>.ApiService.http` file and add endpoints to test the workflow:

```http
@host=http://localhost:<app-port>

### Start the workflow
# @name workflowStartRequest
POST {{host}}/start
Content-Type: application/json

{
    "id": "{{$guid}}",
    "key1": "value1"
}

### Get the workflow status
@instanceId={{workflowStartRequest.response.body.$.instanceId}}
GET {{host}}/status/{{instanceId}}
```

### Key points

- The `<app-port>` must match the port in the ApiService `launchSettings.json`.
- The `start` request matches the `MapPost("/start", ...)` endpoint in `Program.cs`. The json payload in the request should match the workflow input record type that uses the `[FromBody]` attribute in `Program.cs`.
- The `status` request matches the `MapGet("/status/{instanceId}", ...)` endpoint in `Program.cs`.
- Use the VS Code REST Client extension or JetBrains HTTP Client to send requests directly from this file.

## .gitignore

See [`../shared/dotnet-gitignore.md`](../shared/dotnet-gitignore.md) for instructions.

## Running Locally

Start the application from the solution root:

```shell
aspire run
```

This launches the Aspire AppHost, which orchestrates:
- A Valkey container for workflow state persistence (port 16379)
- The ApiService with a Dapr sidecar
- The Diagrid Dev Dashboard container

The Aspire dashboard opens automatically in the browser, showing all resources and their status. Click on the Diagrid Dashboard endpoint to view workflow instances, their status, and execution history.
