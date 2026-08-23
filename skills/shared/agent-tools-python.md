# Python tools — `@tool` decorator

Tools are the functions an agent can call. Place all tools in a `tools.py` file and decorate each with `@tool`. The docstring is what the LLM reads to decide when to call the tool, so it must be precise.

```python
from dapr_agents import tool
from pydantic import BaseModel, Field


class GetWeatherArgs(BaseModel):
    """Arguments for get_weather."""
    location: str = Field(description="City name, e.g. 'London' or 'San Francisco'.")
    unit: str = Field(default="celsius", description="Temperature unit: 'celsius' or 'fahrenheit'.")


@tool(args_model=GetWeatherArgs)
def get_weather(location: str, unit: str = "celsius") -> str:
    """Return the current weather for a city. Use this tool whenever the user asks about the weather."""
    # Call your real weather API here.
    return f"{location}: 18°{unit[0].upper()}, partly cloudy"
```

### Key points

- Every tool needs a docstring — the LLM uses it to route. Be specific about inputs, outputs, and when to call the tool.
- Use a Pydantic `args_model` for input validation. The framework auto-generates the JSON schema the LLM sees from this model.
- Tools should be **idempotent** whenever possible. Dapr Workflow may retry an activity call if a worker restarts mid-flight — if the tool mutates state, include an idempotency key in the request.
- Keep the return value small and structured. Large payloads bloat the LLM context and slow the agent down.
- Import the `@tool` decorator from `dapr_agents` for native agents, or from the relevant framework (e.g., `from agents import function_tool` for OpenAI Agents) when using a framework wrapper. `REFERENCE.md` per-framework sections show the exact import.

## Security key points

Tools are the primary attack surface in LLM agent systems. Every argument a tool receives has been constructed by an LLM that may have been steered by untrusted user input; every value a tool returns flows back into the LLM's context. Treat both as untrusted.

- **SSRF**: If a tool constructs an outbound URL from any argument, validate against an allowlist before calling `httpx` / `requests`. Block private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.169.254/32`). Do not follow redirects by default.
- **Path traversal**: If a tool accepts a filename or path, resolve it against an allowed root (`pathlib.Path(root).resolve() / user_value`) and re-check that the resolved path is within the root. Reject symlinks to paths outside the root.
- **Prompt injection**: Tool return values become part of the agent's next prompt. Content sourced from external HTTP responses, database rows, user-controlled state stores, or email bodies can contain adversarial text that overrides the agent's instructions. Sanitise or bound the response (truncate, structure into a typed Pydantic model, strip instruction-like prefixes) before returning.
- **Tool-argument injection**: Treat every LLM-supplied argument as untrusted input to downstream sinks — never interpolate directly into shell commands, SQL, regex, file paths, or URLs. Use parameterised APIs and schema validation.
- **Trace propagation**: When a tool makes outbound HTTP calls, inject the current trace context so the downstream call links into the agent's trace:

  ```python
  from opentelemetry.propagate import inject

  headers: dict[str, str] = {}
  inject(headers)
  response = httpx.get(url, headers=headers)
  ```

  This pairs with the `DAG-OBS-005` rule in `review-agent-observability`.
