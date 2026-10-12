# .NET tools — `AIFunctionFactory.Create`

Tools in the Microsoft Agent Framework are plain C# methods wrapped with `AIFunctionFactory.Create`. Put them in a `Tools/` folder and register them on the agent at startup. Under `Diagrid.AI.Microsoft.AgentFramework` each tool invocation runs as its own Dapr Workflow activity, so a tool call that has already completed is not re-executed when the run resumes.

```csharp
using System.ComponentModel;
using Microsoft.Extensions.AI;

namespace <ProjectNamespace>.Tools;

internal static class WeatherTools
{
    public static AIFunction GetWeather { get; } = AIFunctionFactory.Create(GetWeatherImpl, name: "GetWeather");

    [Description("Return the current weather for a city. Use whenever the user asks about weather.")]
    private static string GetWeatherImpl(
        [Description("City name, e.g. 'London' or 'San Francisco'.")] string location,
        [Description("Temperature unit: 'celsius' or 'fahrenheit'.")] string unit = "celsius")
    {
        // Call your real weather API here.
        return $"{location}: 18°{char.ToUpper(unit[0])}, partly cloudy";
    }
}
```

### Key points

- **The tool name is what the LLM sees.** `AIFunctionFactory.Create(method)` uses the method name, so `GetWeatherImpl` would be exposed as `GetWeatherImpl`. Pass `name:` explicitly and use that exact name in the agent's `instructions`. Tool names are matched case-insensitively per agent, and registering two tools with the same name silently keeps only the last one.
- The description is what the LLM reads to choose a tool — same role as a Python docstring. Put it in `[Description]` on the method, or pass it as the `description:` argument of `AIFunctionFactory.Create` (common for lambdas). Be specific.
- Every parameter also needs a `[Description]` so the LLM understands the schema.
- **Activities run at least once.** No retry policy is applied to tool activities, but if the process dies after a tool's side effect and before the activity completion is recorded, the tool runs again on recovery. Make mutating tools idempotent and pass an idempotency key. A stable key is the agent-run instance id combined with the tool arguments — see "Accessing services and the run context" below.
- **A thrown exception fails the whole agent run.** The tool activity rethrows, the agent's workflow fails, and `RunAgentAsync` throws (in a session, the turn is marked failed). For expected or recoverable failures (not found, validation error, upstream 4xx), return a small typed error record the LLM can reason about; let truly unexpected exceptions throw.
- Keep the return value small and structured. Avoid returning full HTTP response bodies or large collections.
- If the LLM calls a tool name that is not registered for the agent (misspelled, or a non-`AIFunction` `AITool` such as a hosted tool, which is advertised to the LLM but not registered for execution), the run fails with "Tool '…' not found in registry". Register only `AIFunction` tools.
- Register the tools on the agent in `Program.cs`. The `tools` parameter is an `IReadOnlyList<AITool>`; a `List<AITool>`, an array (`new[] { WeatherTools.GetWeather }`), or a collection expression all bind:

  ```csharp
  var tools = new List<AITool> { WeatherTools.GetWeather };

  builder.Services.AddDaprAgents()
      .WithAgent(
          agentName: "<AgentName>",
          conversationComponentName: "llm-provider",
          instructions: "... Use the GetWeather tool ...",
          tools: tools,
          serviceLifetime: ServiceLifetime.Singleton);
  ```

### Accessing services and the run context

Tools are built before `builder.Build()`, so they cannot capture services from DI directly. Declare an `IServiceProvider` parameter instead: the library binds it from `AIFunctionArguments.Services` at invocation time, and it is not part of the JSON schema the LLM sees.

```csharp
using System.ComponentModel;
using System.Security.Cryptography;
using System.Text;
using Diagrid.AI.Microsoft.AgentFramework.Abstractions;
using Microsoft.Extensions.AI;

namespace <ProjectNamespace>.Tools;

internal static class OrderTools
{
    public static AIFunction PlaceOrder { get; } = AIFunctionFactory.Create(
        async ([Description("Product SKU.")] string sku,
               [Description("Quantity, 1-10.")] int quantity,
               IServiceProvider services) =>
        {
            // Stable across re-executions of this tool call: agent-run instance id + arguments.
            var runId = services.GetRequiredService<IDaprAgentContextAccessor>().Current?.CurrentWorkflowInstanceId ?? "";
            var idempotencyKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{runId}|{sku}|{quantity}")));

            var http = services.GetRequiredService<IHttpClientFactory>().CreateClient("orders");
            var response = await http.PostAsJsonAsync("/orders", new { sku, quantity, idempotencyKey });
            return response.IsSuccessStatusCode
                ? new OrderToolResult(true, null)
                : new OrderToolResult(false, $"Order service returned {(int)response.StatusCode}.");
        },
        name: "PlaceOrder",
        description: "Place an order for a product. Returns success or an error the agent can explain to the user.");
}

internal sealed record OrderToolResult(bool Success, string? Error);
```

- `IDaprAgentContextAccessor.Current` is set for the duration of each tool activity; `CurrentWorkflowInstanceId` is the id of the agent run that invoked the tool.
- Register the named `HttpClient` (`builder.Services.AddHttpClient("orders", ...)`) in `Program.cs`.

## Security key points

Tools are the primary attack surface in LLM agent systems. Every argument a tool receives has been constructed by an LLM that may have been steered by untrusted user input; every value a tool returns flows back into the LLM's context. Treat both as untrusted.

- **SSRF**: If a tool constructs an outbound URL from any argument, validate against an allowlist before calling `HttpClient.GetAsync`. Block private IP ranges and the AWS metadata endpoint (`169.254.169.254`). Disable redirect-following by default (`HttpClientHandler { AllowAutoRedirect = false }`).
- **Path traversal**: If a tool accepts a filename or path, resolve with `Path.GetFullPath` and re-check that the result starts with the allowed root (`resolved.StartsWith(allowedRoot, StringComparison.Ordinal)`). Reject symlinks that resolve outside the root.
- **Prompt injection**: Tool return values become part of the agent's next prompt. External HTTP responses, database rows, and user-supplied state can carry adversarial text that overrides the agent's instructions. Return a typed record with bounded size; strip instruction-like content before returning.
- **Tool-argument injection**: Treat every LLM-supplied argument as untrusted input to downstream sinks. Never interpolate directly into shell commands, SQL (use parameterised `DbCommand.Parameters`), regex, file paths, or URLs.
- **Human approval for sensitive tools**: wrap a tool in `new ApprovalRequiredAIFunction(tool)` to gate it behind an `IToolApprovalHandler`. See "Tool approval" in [`../create-agent-dotnet/REFERENCE.md`](../create-agent-dotnet/REFERENCE.md); without a registered handler every gated call is denied.
- **Trace propagation**: When a tool makes outbound HTTP calls, let `HttpClient` propagate the `Activity` context automatically (the default in .NET 10's `HttpClient`) by ensuring `HttpClient` is injected via `IHttpClientFactory` rather than constructed ad-hoc. If the downstream service is outside the Dapr mesh, verify `traceparent` is being emitted on the outbound request.
