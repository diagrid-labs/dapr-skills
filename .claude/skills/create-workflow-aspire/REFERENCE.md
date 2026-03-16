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
<Project Sdk="Aspire.AppHost.Sdk/13.1.2">

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
    <PackageReference Include="Aspire.Hosting.Valkey" Version="13.1.2" />
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

- Uses `Aspire.AppHost.Sdk/13.1.2` instead of the standard .NET SDK.
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

Use `AddDaprWorkflow` to register and activity types. Use `AddDaprWorkflowVersioning` to enable workflow versioning. Use `DaprWorkflowClient` to schedule workflow instances and query their status via HTTP endpoints. Use `AddServiceDefaults` to integrates with the Aspire ServiceDefaults:

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
    options.RegisterWorkflow<MyWorkflow>();
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

    return Results.Accepted(instanceId);
});

app.MapGet("/status", async (
    [FromServices] DaprWorkflowClient workflowClient,
    string instanceId) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId);
    if (!state.Exists)
    {
        return Results.NotFound($"Workflow instance '{instanceId}' not found.");
    }

    return Results.Ok(state);
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
- Ensure the workflow output is included in the response when the `status` endpoint is called.
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
    <PackageReference Include="Dapr.Workflow" Version="1.17.4" />
    <PackageReference Include="Dapr.Workflow.Versioning" Version="1.17.4" />
  </ItemGroup>

</Project>
```

### Key points

- References the ServiceDefaults project for shared Aspire configuration.
- Uses `Dapr.Workflow` version `1.17.4` for workflow support.
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

Define record types for workflow and activity input/output in a `Models` folder. Record types must be serializable since Dapr persists workflow state.

```csharp
namespace <ProjectNamespace>.Models;

public record WorkflowInput(string Message);
public record WorkflowOutput(string Result);
public record ActivityInput(string Data);
public record ActivityOutput(string ProcessedData);
```

### Key points

- Place all model record types in the `Models` folder/namespace.
- Put all model record types in one `cs` file.
- Use `record` types for immutability and built-in serialization support.
- Define separate input and output types for workflows and activities to keep contracts clear.
- Record types should be `public` so they can be referenced across namespaces.

## Workflow Class

A workflow class inherits from `Workflow<TInput, TOutput>` and overrides the `RunAsync` method. The workflow orchestrates one or more activities by calling `context.CallActivityAsync`. Use record types from the `Models` folder for input and output. Workflow class names should have a `Workflow` suffix.

```csharp
using Dapr.Workflow;
using <ProjectNamespace>.Activities;
using <ProjectNamespace>.Models;

namespace <ProjectNamespace>;

internal sealed class MyWorkflow : Workflow<WorkflowInput, WorkflowOutput>
{
    public override async Task<WorkflowOutput> RunAsync(WorkflowContext context, WorkflowInput input)
    {
        var activityInput = new ActivityInput(input.Message);
        var activityOutput = await context.CallActivityAsync<ActivityOutput>(
            nameof(MyActivity),
            activityInput);

        return new WorkflowOutput(activityOutput.ProcessedData);
    }
}
```

### Key points

- The first generic type parameter (`TInput`) is the workflow input type (e.g., `WorkflowInput`).
- The second generic type parameter (`TOutput`) is the workflow output type (e.g., `WorkflowOutput`).
- Use `context.CallActivityAsync<TOutput>(activityName, input)` to call an activity.
- Use `nameof()` to reference activity names to avoid magic strings.
- Place workflow classes in a `Workflows` folder/namespace for organization.
- Activities can be chained by passing the output of one activity as the input to the next.
- Map between workflow and activity model types as needed.
- The workflow class should be `internal sealed`.

### Workflow determinism

Workflow code must be deterministic because the runtime replays the `RunAsync` method multiple times to ensure workflow durability. Avoid the following inside a workflow:

- `DateTime.Now` or `DateTime.UtcNow` — use `context.CurrentUtcDateTime` instead.
- `Guid.NewGuid()` — use `context.NewGuid()` instead.
- Random number generation.
- Direct I/O operations (HTTP calls, file access, database queries) — perform these in activities instead.
- `Thread.Sleep` or `Task.Delay` — use `context.CreateTimer()` instead.
- while loops - use context.ContinueAsNew(<TInput>) instead.

### Workflow patterns

#### Task chaining

Chain multiple activities by passing each result to the next activity:

```csharp
using Dapr.Workflow;

namespace <ProjectNamespace>;

internal sealed class ChainingWorkflow : Workflow<string, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, string input)
    {
        var result1 = await context.CallActivityAsync<string>(
            nameof(Step1Activity),
            input);
        var result2 = await context.CallActivityAsync<string>(
            nameof(Step2Activity),
            result1);
        var result3 = await context.CallActivityAsync<string>(
            nameof(Step3Activity),
            result2);

        return result3;
    }
}
```

#### Fan-out/fan-in

Execute multiple activities in parallel and wait for all of them to complete:

```csharp
using Dapr.Workflow;

namespace <ProjectNamespace>;

internal sealed class FanOutFanInWorkflow : Workflow<string[], string[]>
{
    public override async Task<string[]> RunAsync(WorkflowContext context, string[] inputs)
    {
        var tasks = inputs.Select(input =>
            context.CallActivityAsync<string>(nameof(ProcessActivity), input));

        var results = await Task.WhenAll(tasks);

        return results;
    }
}
```

#### Child-workflows

Call another workflow from within a workflow using `context.CallChildWorkflowAsync`:

```csharp
using Dapr.Workflow;

namespace <ProjectNamespace>;

internal sealed class ParentWorkflow : Workflow<string, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, string input)
    {
        var result = await context.CallChildWorkflowAsync<string>(
            nameof(ChildWorkflow),
            input);

        return result;
    }
}
```

#### Monitor pattern

```csharp
using Dapr.Workflow;

namespace <ProjectNamespace>;

internal sealed class MonitorWorkflow : Workflow<int, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, int counter)
    {
        var status = await context.CallActivityAsync<Status>(
            nameof(CheckStatus),
            counter);

        if (!status.IsReady)
        {
            await context.CreateTimer(TimeSpan.FromSeconds(30));
            counter++;
            context.ContinueAsNew(counter);
        }

        return $"Status is healthy after checking {counter} times.";
    }
}
```

## Activity Class

An activity class inherits from `WorkflowActivity<TInput, TOutput>` and overrides the `RunAsync` method. Activities contain the actual business logic. Use record types from the `Models` folder for input and output. Activity class names should have an `Activity` suffix.

```csharp
using Dapr.Workflow;
using <ProjectNamespace>.Models;

namespace <ProjectNamespace>.Activities;

internal sealed class MyActivity : WorkflowActivity<ActivityInput, ActivityOutput>
{
    public override Task<ActivityOutput> RunAsync(WorkflowActivityContext context, ActivityInput input)
    {
        Console.WriteLine($"{nameof(MyActivity)}: Received input: {input.Data}.");

        // TODO: implement actual functionality

        return Task.FromResult(new ActivityOutput($"Processed: {input.Data}"));
    }
}
```

### Key points

- The first generic type parameter (`TInput`) is the activity input type (e.g., `ActivityInput`).
- The second generic type parameter (`TOutput`) is the activity output type (e.g., `ActivityOutput`).
- The `RunAsync` method receives a `WorkflowActivityContext` and the input.
- Activities should be `internal sealed`.
- Place activity classes in an `Activities` folder/namespace for organization.
- If the activity method body is synchronous, return `Task.FromResult()` instead of marking the method `async`.
- Activities are where non-deterministic and I/O operations should be performed (HTTP calls, database queries, file access, etc.).
- If the exact functionality is unclear, add a `// TODO: implement actual functionality` statement inside the RunAsync method.

## <SolutionRoot>.ApiService.http

Update the existing `<SolutionRoot>.ApiService.http` file in the `<SolutionRoot>.ApiService` folder and add endpoints to test the workflow:

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
@instanceId={{workflowStartRequest.response.headers.location}}
GET {{host}}/status?instanceId={{instanceId}}
```

### Key points

- The `<app-port>` must match the port in the ApiService `launchSettings.json`.
- The `start` request matches the `MapPost("/start", ...)` endpoint in `Program.cs`. The json payload in the request should match the workflow input record type that uses the `[FromBody]` attribute in `Program.cs`.
- The `status` request matches the `MapGet("/status", ...)` endpoint in `Program.cs`.
- Use the VS Code REST Client extension or JetBrains HTTP Client to send requests directly from this file.

## .gitignore

Create a `.gitignore` file in the solution root with common Visual Studio / .NET ignore patterns. Use this as the source: https://raw.githubusercontent.com/github/gitignore/refs/heads/main/VisualStudio.gitignore.

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
