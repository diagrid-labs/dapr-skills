# Reference: .NET Agent Application

Microsoft Agent Framework agents executed durably on Dapr Workflow via [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework), built from [`diagridio/dotnet-ai`](https://github.com/diagridio/dotnet-ai).

> **Single source of truth for this API.** The package README at [`src/Diagrid.AI.Microsoft.AgentFramework/README.md`](https://github.com/diagridio/dotnet-ai/blob/master/src/Diagrid.AI.Microsoft.AgentFramework/README.md) and the runnable samples under [`examples/`](https://github.com/diagridio/dotnet-ai/tree/master/examples) are authoritative. The signatures below were taken from `master`; if the package has moved on, prefer the repo over this file.

## .csproj

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <RootNamespace><ProjectNamespace></RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Diagrid.AI.Microsoft.AgentFramework" Version="1.0.10" />
  </ItemGroup>
</Project>
```

### Key points

- **One package.** `Microsoft.Agents.AI`, `Microsoft.Extensions.AI`, `Dapr.Workflow`, and the Dapr conversation/state/metadata clients all arrive transitively. Adding them explicitly at other versions is how you get a downgrade warning or a restore conflict.
- A bare `Version="1.0.10"` in NuGet is a **minimum**, not an exact pin — NuGet resolves the lowest version that satisfies it, and a floating or transitive constraint can lift it. Write `[1.0.10]` if you genuinely need to lock a single version.
- `Dapr.Client` is **not** transitive. Add it explicitly if you publish pub/sub events yourself (the multi-agent coordinator below does).
- The package multi-targets `net8.0`, `net9.0` and `net10.0`; the scaffold targets `net10.0`.

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

public sealed record AgentRunRequest(string Prompt, string? SessionId = null);

public sealed record AgentRunReply(string Output, string? SessionId);
```

### Key points

- Use `sealed record` types — they are immutable and JSON-serializable out of the box.
- **Do not name these `AgentResponse`.** `Microsoft.Agents.AI.AgentResponse` is the type `IDaprAgentInvoker.RunAgentAsync` returns and is in scope in `Program.cs`; a local record with the same name shadows it and the file stops compiling.

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
using Dapr.Workflow;
using Diagrid.AI.Microsoft.AgentFramework.Abstractions;
using Diagrid.AI.Microsoft.AgentFramework.Hosting;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using <ProjectNamespace>.Models;
using <ProjectNamespace>.Tools;

var builder = WebApplication.CreateBuilder(args);

var tools = new List<AITool> { WeatherTools.GetWeather };

builder.Services.AddDaprAgents()
    .WithAgent(
        agentName: "weather",
        conversationComponentName: "llm-provider",
        instructions: "Answer weather questions using the GetWeather tool.",
        tools: tools,
        serviceLifetime: ServiceLifetime.Singleton);

var app = builder.Build();

app.MapPost("/run", async (
    AgentRunRequest request,
    IDaprAgentInvoker invoker,
    DaprWorkflowClient workflowClient,
    CancellationToken ct) =>
{
    // No session id on the request means a new conversation; otherwise re-attach
    // to the running session workflow so earlier turns stay in context.
    AgentSession session = request.SessionId is null
        ? await invoker.CreateSessionAsync(workflowClient, cancellationToken: ct)
        : invoker.AttachSession(request.SessionId);

    var agent = invoker.GetAgent("weather");
    var response = await invoker.RunAgentAsync(agent, request.Prompt, session, cancellationToken: ct);

    return Results.Ok(new AgentRunReply(response.Text, session.GetSessionInstanceId()));
});

app.Run();
```

### Key points

- `AddDaprAgents()` registers the Dapr conversation client, the state-management client, the workflow runtime, and the agent/tool registries. You do **not** call `AddDaprConversationClient()` or `AddDaprWorkflow()` yourself, and you do **not** register an `IChatClient` — no provider SDK (`OpenAIClient`, `AnthropicClient`) appears in this file. The provider is chosen by `resources/llm-provider.yaml`.
- `conversationComponentName` must equal the `metadata.name` of that component. The scaffold uses `llm-provider` in both places.
- `tools` is an `IReadOnlyList<AITool>` — `AIFunction` derives from `AITool`, so a `List<AITool>` of `AIFunctionFactory.Create(...)` results is what the overload wants. Each tool invocation is dispatched as its own workflow activity, which is what makes a partially-completed agent turn resumable.
- `IDaprAgentInvoker` is the entrypoint. `GetAgent(name)` returns an `IDaprAIAgent` handle; `RunAgentAsync(agent, message, cancellationToken:)` returns a `Microsoft.Agents.AI.AgentResponse` whose `.Text` is the final answer. There is no `WorkflowInstanceId` on that response — use `RunAgentAndDeserializeAsync<T>(...)` for a typed result, and the Dapr workflow management API (or the Dev Dashboard) to inspect the run.
- `serviceLifetime` controls the lifetime of the keyed chat client. `Singleton` matches the examples in `diagridio/dotnet-ai`; the parameter defaults to `Scoped`.
- **Conversation memory is the session, and the session is a workflow.** `CreateSessionAsync` schedules a `SessionWorkflow` and returns an `AgentSession` whose instance id is the conversation handle; `AttachSession(id)` re-attaches to it. Pass the session as the third positional argument to `RunAgentAsync`. Omit it and every call is a fresh conversation with no history — which is why there is no `agent-memory` component on the .NET path: the turns live in the session workflow's state, in the `agent-workflow` store. Return the session id to the caller so it can be sent back on the next turn. Cap a session with `CreateSessionAsync(workflowClient, maxTurns: 20)`.

### Typed results

To get a deserialized object instead of text, register a `JsonSerializerContext` and use the deserializing overload:

```csharp
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(StructuredAnswer))]
public partial class AgentJsonContext : JsonSerializerContext;

public sealed record StructuredAnswer(string Answer, double Confidence);

builder.Services.AddDaprAgents(options => options.AddContext(() => AgentJsonContext.Default))
    .WithAgent(/* … */);

// then, in the endpoint:
var answer = await invoker.RunAgentAndDeserializeAsync<StructuredAnswer>(agent, request.Prompt, cancellationToken: ct);
```

## Program.cs (coordinator + specialists)

Use one .NET project per agent. Each declares its own agent with `WithAgent(...)` exactly as above; the coordinator additionally publishes to each specialist's `<domain>.requests` topic and receives results on `<domain>.results`.

Publishing needs `Dapr.Client` (not transitive) and `builder.Services.AddDaprClient()`:

```csharp
builder.Services.AddDaprClient();

builder.Services.AddDaprAgents()
    .WithAgent(
        agentName: "coordinator",
        conversationComponentName: "llm-provider",
        instructions: "Break the request down and delegate each part to the right specialist.",
        tools: coordinatorTools,
        serviceLifetime: ServiceLifetime.Singleton);
```

Give the coordinator one tool per specialist; each tool publishes the request and is what the LLM chooses between:

```csharp
public static AIFunction AskVenueScout(DaprClient dapr) => AIFunctionFactory.Create(
    async ([Description("The venue question to delegate.")] string question) =>
    {
        await dapr.PublishEventAsync("agent-pubsub", "venue.requests", new { question });
        return "Delegated to venue_scout; the result will arrive on venue.results.";
    },
    "ask_venue_scout",
    "Delegate a venue question to the venue_scout specialist.");
```

### Key points — multi-agent

- **Topic convention**: `<domain>.requests` and `<domain>.results`. The coordinator has no request topic of its own; it is invoked over HTTP via `POST /run`.
- Specialists subscribe with `app.MapPost("/venue.requests", …)` plus a Dapr `Subscription` (declarative YAML in `resources/`, or the programmatic `/dapr/subscribe` endpoint). Each specialist runs its own agent and publishes to `<domain>.results`.
- Each project has its own `Properties/launchSettings.json` with a unique port (5100, 5101, 5102, …) matching `appPort` in `dapr.yaml`.
- Every app shares `resourcesPath: ./resources`, so all of them see the same `llm-provider`, `agent-workflow` and `agent-pubsub` components.
- There is no `agent-registry` component in the local OSS scaffold. `Diagrid.AI.Microsoft.AgentFramework` only writes an agent registry when you opt in with `.WithCatalyst(...)` — see below — and that path targets Diagrid Catalyst, not `dapr init`.

## local.http

```
### Start an agent run (no sessionId — starts a new conversation)
POST http://localhost:5100/run
Content-Type: application/json

{
  "prompt": "What is the weather in London today?"
}

### Continue the same conversation (sessionId from the previous response)
POST http://localhost:5100/run
Content-Type: application/json

{
  "prompt": "And tomorrow?",
  "sessionId": "{{session_id}}"
}
```

For multi-agent, add one `POST` per specialist port to test specialists in isolation.

## Running locally

See [`../shared/running-locally-dapr.md`](../shared/running-locally-dapr.md).

To inspect workflow runs, start the Diagrid Dev Dashboard yourself — it is a separate container, not something `dapr init` installs:

```shell
docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest
```

## Running with Diagrid Catalyst

See [`../shared/running-with-catalyst.md`](../shared/running-with-catalyst.md).

If you want the agent to show up in the Catalyst **Agents** view, opt in explicitly:

```csharp
builder.Services.AddDaprAgents()
    .WithAgent(/* … */)
    .WithCatalyst();
```

`WithCatalyst()` adds a hosted service that, at startup, writes the agent's metadata to the state component named by `DiagridCatalystOptions.Registry.ResourceName` — which defaults to `agent-registry`.

> **This write can succeed and still leave the agent invisible.** The Agents view is populated by a sidecar interceptor bound to the component named exactly `agent-registry`, and that component is scoped so that only App IDs declared by an `Agent` resource are intercepted. If your App ID is not in that scope, `SaveStateAsync` returns without an error and nothing appears in the view. `diagrid component list` is not evidence either way — it renders `agent-registry` as available to all app identities regardless of the actual scope. Verify by looking for the agent in the Agents view, not by the absence of an exception. `agent-*` components are also not provisioned on every project: check that `agent-registry` exists on the target project before relying on it.
