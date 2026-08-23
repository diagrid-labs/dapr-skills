# .NET tools — `AIFunctionFactory.Create`

Tools in the Microsoft Agent Framework are plain C# methods wrapped with `AIFunctionFactory.Create`. Put them in a `Tools/` folder and register them on the agent at startup.

```csharp
using System.ComponentModel;
using Microsoft.Extensions.AI;

namespace <ProjectName>.Tools;

internal static class WeatherTools
{
    public static AIFunction GetWeather { get; } = AIFunctionFactory.Create(GetWeatherImpl);

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

- The `[Description]` attribute on the method is what the LLM reads — same role as a Python docstring. Be specific.
- Every parameter also needs a `[Description]` so the LLM understands the schema.
- Tools should be **idempotent** whenever possible. Pass an idempotency key when the tool mutates state, because Dapr Workflow may retry the activity call.
- Keep the return value small and structured. Avoid returning full HTTP response bodies or large collections.
- Register the tool on the agent in `Program.cs`:

  ```csharp
  builder.Services.AddDaprAgents()
      .WithAgent(name: "<AgentName>", instructions: "...", tools: new[] { WeatherTools.GetWeather });
  ```

## Security key points

Tools are the primary attack surface in LLM agent systems. Every argument a tool receives has been constructed by an LLM that may have been steered by untrusted user input; every value a tool returns flows back into the LLM's context. Treat both as untrusted.

- **SSRF**: If a tool constructs an outbound URL from any argument, validate against an allowlist before calling `HttpClient.GetAsync`. Block private IP ranges and the AWS metadata endpoint (`169.254.169.254`). Disable redirect-following by default (`HttpClientHandler { AllowAutoRedirect = false }`).
- **Path traversal**: If a tool accepts a filename or path, resolve with `Path.GetFullPath` and re-check that the result starts with the allowed root (`resolved.StartsWith(allowedRoot, StringComparison.Ordinal)`). Reject symlinks that resolve outside the root.
- **Prompt injection**: Tool return values become part of the agent's next prompt. External HTTP responses, database rows, and user-supplied state can carry adversarial text that overrides the agent's instructions. Return a typed record with bounded size; strip instruction-like content before returning.
- **Tool-argument injection**: Treat every LLM-supplied argument as untrusted input to downstream sinks. Never interpolate directly into shell commands, SQL (use parameterised `DbCommand.Parameters`), regex, file paths, or URLs.
- **Trace propagation**: When a tool makes outbound HTTP calls, let `HttpClient` propagate the `Activity` context automatically (the default in .NET 10's `HttpClient`) by ensuring `HttpClient` is injected via `IHttpClientFactory` rather than constructed ad-hoc. If the downstream service is outside the Dapr mesh, verify `traceparent` is being emitted on the outbound request.
