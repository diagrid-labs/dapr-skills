# Reference: Dapr Agents .NET Application

## .csproj

> **Advisory:** `Diagrid.Agents.Workflow` is an **indicative** NuGet id. Verify the exact id at [nuget.org](https://www.nuget.org/) and against the upstream [`diagridio/catalyst-quickstarts/agents/microsoft-dotnet`](https://github.com/diagridio/catalyst-quickstarts/tree/main/agents/microsoft-dotnet) `.csproj` before committing the scaffold. Diagrid's .NET agent runtime package may ship under a different id; this file will be stale if the upstream name shifts.

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace><ProjectNamespace></RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.AI" Version="9.7.1" />
    <PackageReference Include="Microsoft.Extensions.AI.OpenAI" Version="9.7.1-preview.1.25365.4" />
    <PackageReference Include="Microsoft.Agents.AI" Version="1.0.0-preview.250920.3" />
    <!-- VERIFY PACKAGE ID — Diagrid's .NET agent runtime package may ship under a different id. -->
    <PackageReference Include="Diagrid.Agents.Workflow" Version="0.3.0" />
  </ItemGroup>
</Project>
```

Pin versions according to the latest tested set at the time of scaffolding. The package id `Diagrid.Agents.Workflow` mirrors the `diagrid[...]` PyPI extras and exposes `IDaprAgentInvoker` — but the id itself is unverified in this scaffold; see the Advisory above.

## Properties/launchSettings.json

```json
{
  "profiles": {
    "<ProjectName>": {
      "commandName": "Project",
      "dotnetRunMessages": true,
      "launchBrowser": false,
      "applicationUrl": "http://localhost:5100",
      "environmentVariables": {
        "ASPNETCORE_ENVIRONMENT": "Development"
      }
    }
  }
}
```

## Models/AgentContracts.cs

```csharp
namespace <ProjectNamespace>.Models;

public sealed record AgentRequest(string Task, string? SessionId = null);

public sealed record AgentResponse(string Output, string WorkflowInstanceId);
```

### Key points

- Use `sealed record` types — they are immutable and JSON-serializable out of the box.
- Separate request and response types keep the contract explicit.

## Tools/WeatherTools.cs

Follow the canonical pattern in [`../shared/agent-tools-dotnet.md`](../shared/agent-tools-dotnet.md):

```csharp
using System.ComponentModel;
using Microsoft.Extensions.AI;

namespace <ProjectNamespace>.Tools;

internal static class WeatherTools
{
    public static AIFunction GetWeather { get; } = AIFunctionFactory.Create(GetWeatherImpl);

    [Description("Return the current weather for a city.")]
    private static string GetWeatherImpl(
        [Description("City name, e.g. 'London'.")] string location,
        [Description("Temperature unit: 'celsius' or 'fahrenheit'.")] string unit = "celsius")
    {
        return $"{location}: 18°{char.ToUpper(unit[0])}, partly cloudy";
    }
}
```

## Program.cs (single agent)

```csharp
using Diagrid.Agents.Workflow;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using OpenAI;
using <ProjectNamespace>.Models;
using <ProjectNamespace>.Tools;

var builder = WebApplication.CreateBuilder(args);

// Read the key from the environment FIRST, then fall back to configuration.
// Never store API keys in appsettings.json or appsettings.Development.json —
// those files can be committed to source control. Environment variables only.
var openAiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY")
    ?? builder.Configuration["OPENAI_API_KEY"]
    ?? throw new InvalidOperationException("OPENAI_API_KEY is not set. Export it in your shell before running dapr run.");

builder.Services.AddSingleton<IChatClient>(_ =>
    new OpenAIClient(openAiKey).GetChatClient("gpt-4.1").AsIChatClient());

builder.Services.AddDaprAgents()
    .WithAgent(
        name: "weather",
        role: "Weather Assistant",
        instructions: "Answer weather questions using the GetWeather tool.",
        tools: new[] { WeatherTools.GetWeather },
        maxIterations: 10);

var app = builder.Build();

app.MapPost("/run", async (AgentRequest request, IDaprAgentInvoker invoker, CancellationToken ct) =>
{
    var result = await invoker.RunAsync(
        agentName: "weather",
        input: request.Task,
        sessionId: request.SessionId,
        cancellationToken: ct);

    return Results.Ok(new AgentResponse(result.Output, result.WorkflowInstanceId));
});

app.Run();
```

### Key points

- `builder.Services.AddDaprAgents().WithAgent(...)` registers the agent with the Diagrid runner. The runner sits on top of Dapr Workflow, so every agent run is durable.
- `IDaprAgentInvoker` is the single entrypoint your API layer uses to trigger an agent run; it returns the result when the workflow completes and surfaces the workflow instance id for status lookups.
- Tools are declared at startup and passed to `WithAgent(...)` as an `AIFunction` array. The LLM can choose any of them at runtime.
- For Anthropic, swap the `IChatClient` registration for `Microsoft.Extensions.AI.Anthropic` + `new AnthropicClient(...)`. The rest of the code stays unchanged.

## Program.cs (coordinator + specialists)

Use one .NET project per agent (coordinator + N specialist apps), each with its own `Program.cs`. The coordinator publishes work to each specialist's `<domain>.requests` topic via `DaprClient.PublishEventAsync` and awaits results on `<domain>.results`:

```csharp
builder.Services.AddDaprAgents()
    .WithAgent(
        name: "coordinator",
        role: "Event Planner Coordinator",
        instructions: "Delegate work to specialist agents discovered via the agent registry.",
        tools: Array.Empty<AIFunction>(),
        maxIterations: 20);
```

Specialists declare their own topics via the Diagrid runner options or via ASP.NET Core `[Topic]` attributes on endpoint handlers.

### Key points — multi-agent

- **Topic convention**: `<domain>.requests` and `<domain>.results`. The coordinator's `<domain>` does not need a request topic; coordinators are invoked via `POST /run` rather than via pub/sub.
- Each project has its own `Properties/launchSettings.json` with a unique port (5100, 5101, 5102, …) matching `appPort` in `dapr.yaml`.
- `resources/agent-registry.yaml` enables runtime discovery so the coordinator does not hardcode specialist endpoints.

## local.http

```
### Start an agent run
POST http://localhost:5100/run
Content-Type: application/json

{
  "task": "What is the weather in London today?"
}
```

For multi-agent, add one `POST` per specialist port to test specialists in isolation.

## Running locally

See [`../shared/running-locally-dapr.md`](../shared/running-locally-dapr.md).

## Running with Diagrid Catalyst

See [`../shared/running-with-catalyst.md`](../shared/running-with-catalyst.md).
