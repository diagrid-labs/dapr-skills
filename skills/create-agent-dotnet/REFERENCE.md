# Reference: .NET Agent Application

Microsoft Agent Framework agents executed durably on Dapr Workflow via [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework), built from [`diagridio/dotnet-ai`](https://github.com/diagridio/dotnet-ai).

> **Single source of truth for this API.** The package README at [`src/Diagrid.AI.Microsoft.AgentFramework/README.md`](https://github.com/diagridio/dotnet-ai/blob/master/src/Diagrid.AI.Microsoft.AgentFramework/README.md) and the runnable samples under [`examples/`](https://github.com/diagridio/dotnet-ai/tree/master/examples) are authoritative. The signatures below match release `1.2.0`; if the package has moved on, prefer the repo over this file.

## License and usage analytics

- **License.** `Diagrid.AI.Microsoft.AgentFramework` is licensed under the Business Source License 1.1 (see [`LICENSE.md`](https://github.com/diagridio/dotnet-ai/blob/master/LICENSE.md)). Production use without a commercial license is permitted only under the Additional Use Grant (among other conditions: organizations below 60 FTE and below USD 15M annual revenue, and not for competing or hosted offerings). Mention this in the generated README so users can check whether it applies to them.
- **Usage analytics.** Releases **after** `1.2.0` send one anonymous usage event per process from `AddDaprAgents()` (package name and version, OS, architecture, .NET version, whether the target is Catalyst or OSS Dapr, and whether it runs in CI). `1.2.0` does not. When you move to a later release, mention it in the generated README and how to opt out: set `DO_NOT_TRACK`, `SCARF_NO_ANALYTICS`, or `DIAGRID_NO_ANALYTICS` to `1`/`true` — for example per app in `dapr.yaml`:

  ```yaml
  apps:
    - appID: <app-id>
      env:
        DO_NOT_TRACK: "1"
  ```

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
    <PackageReference Include="Diagrid.AI.Microsoft.AgentFramework" Version="1.2.0" />
  </ItemGroup>
</Project>
```

### Key points

- **One package for a single agent.** `Microsoft.Agents.AI` (≥ 1.9.0), `Microsoft.Extensions.AI` (≥ 10.6.0), `Dapr.Workflow` (≥ 1.18.4), and the Dapr conversation/state/metadata clients arrive transitively. Do not add them at *lower* versions — that produces `NU1605` downgrade errors or a runtime `MissingMethodException`. Explicit references at or above these minimums are fine.
- **Add `Dapr.Workflow` explicitly when the app defines its own workflows** (the coordinator + specialists topology below). The package's dependencies exclude build assets and analyzers, so the transitive `Dapr.Workflow` gives the app neither the workflow source generator (auto-registration) nor the `DAPR13xx` analyzers for its own `Workflow<,>` classes. The `diagridio/dotnet-ai` examples reference it explicitly and also register their workflows via `AddDaprAgents(registrations: ...)`.
- A bare `Version="1.2.0"` in NuGet is a **minimum**, not an exact pin — NuGet resolves the lowest version that satisfies it, and a floating or transitive constraint can lift it. Write `[1.2.0]` if you genuinely need to lock a single version.
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

Follow the canonical pattern in [`../dapr-shared/agent-tools-dotnet.md`](../dapr-shared/agent-tools-dotnet.md):

```csharp
using System.ComponentModel;
using Microsoft.Extensions.AI;

namespace <ProjectNamespace>.Tools;

internal static class WeatherTools
{
    public static AIFunction GetWeather { get; } = AIFunctionFactory.Create(GetWeatherImpl, name: "GetWeather");

    [Description("Return the current weather for a city.")]
    private static string GetWeatherImpl(
        [Description("City name, e.g. 'London'.")] string location,
        [Description("Temperature unit: 'celsius' or 'fahrenheit'.")] string unit = "celsius")
    {
        return $"{location}: 18°{char.ToUpper(unit[0])}, partly cloudy";
    }
}
```

- `name: "GetWeather"` is the tool name the LLM sees; without it the tool would be exposed as `GetWeatherImpl` and the instructions below would reference a tool that does not exist.

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
    AgentSession session;
    if (request.SessionId is null)
    {
        // No session id on the request means a new conversation.
        session = await invoker.CreateSessionAsync(workflowClient, cancellationToken: ct);
    }
    else
    {
        // Re-attach only to a session that is still running. Attaching to a completed
        // session (e.g. after maxTurns) would wait 10 minutes and then time out.
        var sessionState = await workflowClient.GetWorkflowStateAsync(request.SessionId, cancellation: ct);
        if (!sessionState.Exists)
        {
            return Results.NotFound(new { error = $"Session '{request.SessionId}' not found." });
        }
        if (!sessionState.IsWorkflowRunning)
        {
            return Results.Conflict(new { error = "The session has ended; start a new one by omitting sessionId." });
        }
        session = invoker.AttachSession(request.SessionId);
    }

    var agent = invoker.GetAgent("weather");
    var response = await invoker.RunAgentAsync(agent, request.Prompt, session, cancellationToken: ct);

    return Results.Ok(new AgentRunReply(response.Text, session.GetSessionInstanceId()));
});

app.Run();
```

### Key points

- `AddDaprAgents()` registers the Dapr conversation client, the state-management client, the workflow runtime, and the agent/tool registries. You do **not** call `AddDaprConversationClient()` or `AddDaprWorkflow()` yourself, and you do **not** register an `IChatClient` — no provider SDK (`OpenAIClient`, `AnthropicClient`) appears in this file. The provider is chosen by `resources/llm-provider.yaml`.
- `conversationComponentName` must equal the `metadata.name` of that component. The scaffold uses `llm-provider` in both places.
- `tools` is an `IReadOnlyList<AITool>`; a `List<AITool>`, an array, or a collection expression of `AIFunctionFactory.Create(...)` results all bind. Each tool invocation is dispatched as its own workflow activity, which is what makes a partially-completed agent turn resumable. Only `AIFunction` tools are executable; if the LLM calls an unknown tool name, the run fails.
- `IDaprAgentInvoker` is the entrypoint. `GetAgent(name)` returns an `IDaprAIAgent` handle; `RunAgentAsync(agent, message, cancellationToken:)` returns a `Microsoft.Agents.AI.AgentResponse` whose `.Text` is the final answer. There is no `WorkflowInstanceId` on that response — use `RunAgentAndDeserializeAsync<T>(...)` for a typed result, and the Dapr workflow management API (or the Dev Dashboard) to inspect the run. Name-based helpers also exist, e.g. `invoker.RunAgentAsync("weather", prompt, session)`.
- **Each run is capped at 20 LLM iterations.** The library runs its own tool loop (it unwraps any `FunctionInvokingChatClient`), and the cap is not configurable. When it is hit, `RunAgentAsync` returns a normal response whose text says the agent "exceeded the maximum of 20 iterations" — it does not throw. Keep tool sets small and instructions specific.
- **A tool exception fails the run.** `RunAgentAsync` then throws; in a session, the turn is marked failed (and still counts toward `maxTurns`).
- **`/run` blocks until the run finishes.** `RunAgentAsync` waits for the agent workflow to complete without a timeout of its own. For long-running agents, schedule a workflow and return `202 Accepted` with a status URL instead (as the coordinator topology below does).
- `serviceLifetime` controls the lifetime of the keyed chat client. `Singleton` matches the examples in `diagridio/dotnet-ai`; the parameter defaults to `Scoped`.
- **Conversation memory is the session, and the session is a workflow.** `CreateSessionAsync` schedules a `SessionWorkflow` and returns an `AgentSession` whose instance id is the conversation handle; `AttachSession(id)` re-attaches to it. Pass the session as the third positional argument to `RunAgentAsync`. Omit it and every call is a fresh conversation with no history — which is why there is no `agent-memory` component on the .NET path: the turns live in the session workflow's state, in the `agent-workflow` store. Return the session id to the caller so it can be sent back on the next turn.
- **Session limits.** A session completes after `maxTurns` turns (default **200**; set it with `CreateSessionAsync(workflowClient, maxTurns: 20)`). Failed turns count too. The session workflow does not use `ContinueAsNew`, and every turn re-sends the full prior conversation to the agent, so history and payload size grow with each turn — keep sessions short. Attaching to a completed session raises an event nobody waits for and times out after 10 minutes, which is why the endpoint checks `IsWorkflowRunning` first.

### Typed results

To get a deserialized object instead of text, register a `JsonSerializerContext` and use the deserializing overload. Put the types in their own file — type declarations cannot precede the top-level statements in `Program.cs` (`CS8803`):

```csharp
// Models/StructuredAnswer.cs
using System.Text.Json.Serialization;

namespace <ProjectNamespace>.Models;

public sealed record StructuredAnswer(string Answer, double Confidence);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(StructuredAnswer))]
public partial class AgentJsonContext : JsonSerializerContext;
```

```csharp
// Program.cs
builder.Services.AddDaprAgents(options => options.AddContext(() => AgentJsonContext.Default))
    .WithAgent(/* … */);

// then, in the endpoint:
var answer = await invoker.RunAgentAndDeserializeAsync<StructuredAnswer>(agent, request.Prompt, cancellationToken: ct);
```

- The agent must actually reply with JSON: say so in its `instructions` (e.g. "Respond only with a JSON object with the fields `answer` (string) and `confidence` (number between 0 and 1)").

## Program.cs (coordinator + specialists)

The default multi-agent topology runs **all agents in one app**. Each agent is registered with `WithAgent(...)`, and a Dapr Workflow coordinates them with `context.RunAgentAsync(...)`; every agent call runs as a durable child workflow, so a crash mid-plan resumes from the last completed agent call and the specialists' answers flow back into the coordinator. This is the pattern used by the `ResearcherDemo`, `RouterDemo` and `EmailGateDemo` samples.

Add `Dapr.Workflow` to the `.csproj` (the app defines its own workflow):

```xml
<ItemGroup>
  <PackageReference Include="Diagrid.AI.Microsoft.AgentFramework" Version="1.2.0" />
  <PackageReference Include="Dapr.Workflow" Version="1.18.10" />
</ItemGroup>
```

### Models/AgentContracts.cs

```csharp
namespace <ProjectNamespace>.Models;

public static class AgentNames
{
    public const string VenueScout = "venue_scout";
    public const string Caterer = "caterer";
    public const string Coordinator = "coordinator";
}

public sealed record PlanRequest(string Request);

public sealed record PlanResult(bool Success, string Output);
```

### Workflows/PlanWorkflow.cs

```csharp
using Dapr.Workflow;
using Diagrid.AI.Microsoft.AgentFramework.Runtime;
using <ProjectNamespace>.Models;

namespace <ProjectNamespace>.Workflows;

internal sealed class PlanWorkflow : Workflow<PlanRequest, PlanResult>
{
    // Text returned (as a successful response) when an agent hits the 20-iteration cap.
    private const string IterationCapMarker = "exceeded the maximum of";

    public override async Task<PlanResult> RunAsync(WorkflowContext context, PlanRequest input)
    {
        // Fan out to the specialists; each call runs the agent as a durable child workflow.
        var venueTask = context.RunAgentAsync(
            context.GetAgent(AgentNames.VenueScout),
            $"Find suitable venues for this request: {input.Request}");
        var cateringTask = context.RunAgentAsync(
            context.GetAgent(AgentNames.Caterer),
            $"Propose catering for this request: {input.Request}");

        var specialistResults = await Task.WhenAll(venueTask, cateringTask);

        var capped = specialistResults.FirstOrDefault(r => r.Text.Contains(IterationCapMarker, StringComparison.Ordinal));
        if (capped is not null)
        {
            return new PlanResult(false, capped.Text);
        }

        // The coordinator combines the specialists' answers.
        var plan = await context.RunAgentAsync(
            context.GetAgent(AgentNames.Coordinator),
            $"""
             Combine the specialists' answers into one plan for: {input.Request}

             Venues:
             {specialistResults[0].Text}

             Catering:
             {specialistResults[1].Text}
             """);

        return new PlanResult(true, plan.Text);
    }
}
```

### Program.cs

```csharp
using Dapr.Workflow;
using Diagrid.AI.Microsoft.AgentFramework.Hosting;
using Microsoft.Extensions.AI;
using <ProjectNamespace>.Models;
using <ProjectNamespace>.Tools;
using <ProjectNamespace>.Workflows;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDaprAgents(registrations: options => options.RegisterWorkflow<PlanWorkflow>())
    .WithAgent(
        agentName: AgentNames.VenueScout,
        conversationComponentName: "llm-provider",
        instructions: "You find event venues. Use the SearchVenues tool and return a short list with capacity and price.",
        tools: new List<AITool> { VenueTools.SearchVenues },
        serviceLifetime: ServiceLifetime.Singleton)
    .WithAgent(
        agentName: AgentNames.Caterer,
        conversationComponentName: "llm-provider",
        instructions: "You propose catering options. Use the SearchCaterers tool and return a short list with price per person.",
        tools: new List<AITool> { CateringTools.SearchCaterers },
        serviceLifetime: ServiceLifetime.Singleton)
    .WithAgent(
        agentName: AgentNames.Coordinator,
        conversationComponentName: "llm-provider",
        instructions: "You combine specialist answers into one concise event plan.",
        serviceLifetime: ServiceLifetime.Singleton);

var app = builder.Build();

app.MapPost("/run", async (PlanRequest request, DaprWorkflowClient workflowClient) =>
{
    var instanceId = await workflowClient.ScheduleNewWorkflowAsync(nameof(PlanWorkflow), input: request);
    return Results.Accepted($"/status/{instanceId}", new { instanceId });
});

app.MapGet("/status/{instanceId}", async (string instanceId, DaprWorkflowClient workflowClient, CancellationToken ct) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId, cancellation: ct);
    if (!state.Exists)
    {
        return Results.NotFound();
    }

    return Results.Ok(new
    {
        status = state.RuntimeStatus.ToString(),
        result = state.RuntimeStatus == WorkflowRuntimeStatus.Completed ? state.ReadOutputAs<PlanResult>() : null
    });
});

app.Run();
```

### Key points — multi-agent

- **One app, one sidecar.** `dapr.yaml` has a single app entry (see [`../dapr-shared/agent-dapr-yaml-single.md`](../dapr-shared/agent-dapr-yaml-single.md)); no `agent-pubsub` component is needed.
- `context.GetAgent(name)` + `context.RunAgentAsync(agent, message)` runs an agent as a child workflow and returns its `AgentResponse`. Use `context.RunAgentAndDeserializeAsync<T>(...)` for typed specialist output, and `context.RunAgentWithHistoryAsync(agent, message, priorMessages)` when later agents should see the earlier agents' full conversation (see the `ResearcherDemo` sample).
- Determinism rules apply to `PlanWorkflow`: no `DateTime.Now`, `Guid.NewGuid()`, I/O or constructor-injected services in the workflow body. Tools (which run as activities) are where I/O belongs.
- The workflow checks for the iteration-cap text, because a capped agent returns a successful response rather than throwing.
- `/run` returns `202 Accepted` with a status URL, so long plans do not hold the HTTP request open.
- There is no `agent-registry` component in the local OSS scaffold. `Diagrid.AI.Microsoft.AgentFramework` only writes an agent registry when you opt in with `.WithCatalyst(...)` — see below — and that path targets Diagrid Catalyst, not `dapr init`.

### Alternative: specialists as separate apps

Only split specialists into separate apps when they must be deployed or scaled independently. Then give the coordinator agent one tool per specialist that calls the specialist's `/run` endpoint **synchronously** through Dapr service invocation, so the specialist's answer is the tool result:

```csharp
// Tools/SpecialistTools.cs (coordinator app)
using System.ComponentModel;
using Microsoft.Extensions.AI;
using <ProjectNamespace>.Models;

namespace <ProjectNamespace>.Tools;

internal static class SpecialistTools
{
    public static AIFunction AskVenueScout { get; } = AIFunctionFactory.Create(
        async ([Description("The venue question to delegate.")] string question,
               IServiceProvider services,
               CancellationToken ct) =>
        {
            var http = services.GetRequiredService<IHttpClientFactory>().CreateClient("venue-scout");
            var response = await http.PostAsJsonAsync("/run", new AgentRunRequest(question), ct);
            response.EnsureSuccessStatusCode();
            var reply = await response.Content.ReadFromJsonAsync<AgentRunReply>(ct);
            return reply?.Output ?? "";
        },
        name: "ask_venue_scout",
        description: "Ask the venue_scout specialist a venue question and return its answer.");
}
```

```csharp
// Program.cs (coordinator app) — route through the local Dapr sidecar to the specialist's app id
builder.Services.AddHttpClient("venue-scout", client =>
{
    client.BaseAddress = new Uri($"http://localhost:{Environment.GetEnvironmentVariable("DAPR_HTTP_PORT") ?? "3500"}");
    client.DefaultRequestHeaders.Add("dapr-app-id", "venue-scout");
    client.Timeout = TimeSpan.FromMinutes(5);
});
```

- The `IServiceProvider` parameter is bound from `AIFunctionArguments.Services` at invocation time and is not exposed in the tool's JSON schema; this is how a tool built before `builder.Build()` reaches DI services.
- Each specialist is a single-agent app exactly like "Program.cs (single agent)" above, with its own `launchSettings.json` port (5101, 5102, …). Use the .NET variant in [`../dapr-shared/agent-dapr-yaml-multi.md`](../dapr-shared/agent-dapr-yaml-multi.md).
- No `Dapr.Client` package and no pub/sub component are needed. Do not delegate via fire-and-forget pub/sub: the tool would return before the specialist answers, and the answer would never reach the coordinator's run.

## Optional: tool approval, skills, and context providers

These features exist in `1.2.0` (introduced in `1.1.0`). Add them only when the user asks for them.

### Tool approval

Wrap a sensitive tool in `ApprovalRequiredAIFunction` and register an `IToolApprovalHandler` **before** `AddDaprAgents()` — `AddDaprAgents()` registers a `DenyingToolApprovalHandler` with `TryAddSingleton`, so a handler registered later is ignored and every gated call is denied. A denied call is returned to the LLM as a tool result (`approved: false` plus the reason), not as an exception.

```csharp
using Diagrid.AI.Microsoft.AgentFramework.Abstractions;

builder.Services.AddSingleton<IToolApprovalHandler, MyApprovalHandler>(); // must come first

var tools = new List<AITool> { new ApprovalRequiredAIFunction(OrderTools.PlaceOrder) };
builder.Services.AddDaprAgents()
    .WithAgent(agentName: "orders", conversationComponentName: "llm-provider", instructions: "...", tools: tools);

internal sealed class MyApprovalHandler : IToolApprovalHandler
{
    public Task<ToolApprovalDecision> RequestApprovalAsync(ToolApprovalRequest request, CancellationToken cancellationToken = default)
    {
        // Runs inside a workflow activity, so it may wait for a human decision (e.g. poll a store an admin UI updates).
        return Task.FromResult(ToolApprovalDecision.Approve());
    }
}
```

(As with typed results, put `MyApprovalHandler` in its own file, not above the top-level statements.)

### Agent skills

`WithSkills(agentName, ...)` attaches Microsoft Agent Framework skills (file-based, inline, or class-based) to an agent. The API is experimental: add `<NoWarn>$(NoWarn);MAAI001</NoWarn>` to the `.csproj`, and copy file-based skills to the output with `<Content Include="skills\**\*" CopyToOutputDirectory="PreserveNewest" />`. Skill scripts gated with `UseScriptApproval()` go through the `IToolApprovalHandler` above. See the `SkillsDemo` sample. Do not pin a newer `Microsoft.Agents.AI` than the package's dependency when using this experimental API.

### Context providers (long-term memory, RAG)

`WithContextProviders(agentName, AIContextProvider...)` adds Microsoft Agent Framework context providers to an agent. In `1.2.0`, custom providers receive an empty context (no instructions, tools or request messages), so providers that act on the user's message do not work correctly; this is fixed after `1.2.0`. Only generate custom context providers when targeting a release that contains the fix.

### Multiple LLM providers in one app

Register keyed agents to use several conversation components side by side, and select one with `invoker.GetAgent(agentName, chatClientKey)` (or `context.GetAgent(agentName, chatClientKey)` in a workflow). See the `KeyedAgentInvokerDemo` sample.

## Observability

- `Diagrid.AI.Microsoft.AgentFramework` creates no `ActivitySource` or `Meter` of its own. Workflow and conversation spans come from the Dapr sidecar when a tracing `Configuration` is set (see [`../dapr-shared/agent-tracing-zipkin.md`](../dapr-shared/agent-tracing-zipkin.md)); app-level spans come from the OpenTelemetry the app registers.
- Inside LLM and tool activities the library sets W3C baggage on `Activity.Current`: `agent.name`, `agent.operation` (`llm` / `tool`), `agent.chat_client_key`, `tool.name`, `tool.call_id`. Add your own with `invoker.RunAgentWithTelemetryBaggageAsync(...)` (or `context.RunAgentWithTelemetryBaggageAsync(...)` in a workflow).
- At `Debug` level the library logs full prompts, agent responses, tool arguments, and tool results. Keep the `Diagrid.AI` log category at `Information` outside local development.
- The sidecar emits `dapr_workflow_*` and `dapr_component_conversation_*` metrics; see [`../dapr-shared/agent-metrics-prometheus.md`](../dapr-shared/agent-metrics-prometheus.md).

## local.http

Single agent:

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

Coordinator + specialists:

```
### Start a plan
# @name planRequest
POST http://localhost:5100/run
Content-Type: application/json

{
  "request": "A team offsite for 30 people in Amsterdam next month"
}

### Check the plan status
@instanceId={{planRequest.response.body.$.instanceId}}
GET http://localhost:5100/status/{{instanceId}}
```

For specialists running as separate apps, add one `POST /run` per specialist port to test them in isolation.

## Running locally

See [`../dapr-shared/running-locally-dapr.md`](../dapr-shared/running-locally-dapr.md).

The generated README gets the **Diagrid Dapr Dev Dashboard** section from the **README section** of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md): an optional tool the reader installs (install command per OS), not something `dapr init` or the compose file provides. It is started in a second terminal with `diagrid-dev-dashboard` and opens http://localhost:9090.

## Running with Diagrid Catalyst

See [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md).

If you want the agent to show up in the Catalyst **Agents** view, opt in explicitly:

```csharp
builder.Services.AddDaprAgents()
    .WithAgent(/* … */)
    .WithCatalyst();
```

`WithCatalyst()` adds a hosted service that, at startup, writes the agent's metadata — including its full `instructions` — to the state component named by `DiagridCatalystOptions.Registry.ResourceName`, which defaults to `agent-registry`.

- **Only call `WithCatalyst()` when running on Catalyst.** The registry write is not guarded: if the `agent-registry` component does not exist (for example when running locally with `dapr run`), the app fails at startup.
- Do not put secrets in agent instructions; they are copied into the registry.

> **This write can succeed and still leave the agent invisible.** The Agents view is populated by a sidecar interceptor bound to the component named exactly `agent-registry`, and that component is scoped so that only App IDs declared by an `Agent` resource are intercepted. If your App ID is not in that scope, `SaveStateAsync` returns without an error and nothing appears in the view. `diagrid component list` is not evidence either way — it renders `agent-registry` as available to all app identities regardless of the actual scope. Verify by looking for the agent in the Agents view, not by the absence of an exception. `agent-*` components are also not provisioned on every project: check that `agent-registry` exists on the target project before relying on it.

On Catalyst, the separate `Diagrid.AI.Identity` package (experimental, `DGRDID001`) adds workload identity for outbound calls (`AddDiagridIdentity()`, `UseDiagridIdentity()`, `AddDiagridIdentityHttpClient()`). It only works under Catalyst (`diagrid dev run`); on OSS `dapr run` it returns `503 oauth.not_configured`.
