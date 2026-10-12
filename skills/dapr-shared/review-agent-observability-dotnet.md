# Agent Observability Checklist — .NET

Apply each rule below to .NET projects (`language == dotnet`). Scope: `dapr_yaml`, `component_files`, `agent_files`, `tool_files`, and the project's `appsettings*.json` files and `README.md`.

Rule source: see [`../create-agent-dotnet/REFERENCE.md`](../create-agent-dotnet/REFERENCE.md) — section "Observability".

**What the library provides.** `Diagrid.AI.Microsoft.AgentFramework` does not create its own `ActivitySource` or `Meter`. Spans come from the Dapr sidecar (when tracing is configured) and from whatever OpenTelemetry the app registers. Inside LLM and tool activities the library sets W3C baggage on `Activity.Current` — `agent.name`, `agent.operation` (`llm` / `tool`), `agent.chat_client_key`, `tool.name`, `tool.call_id` — and `RunAgentWithTelemetryBaggageAsync` adds caller-supplied baggage. It logs tool invocations at `Information`, and logs full prompts, response text, tool arguments, and tool results at `Debug`.

Rules that share an id with [`review-agent-observability-python.md`](./review-agent-observability-python.md) carry the same semantics. `DAG-OBS-003`, `DAG-OBS-005` and `DAG-OBS-008` are Python-only ids. `DAG-OBS-000` is the "observability delegated to the wrapped framework" finding for Python framework-wrapper projects; it is not emitted for .NET.

| Rule id     | Severity | What to detect | Why it matters | Suggested fix |
| ----------- | -------- | -------------- | -------------- | ------------- |
| DAG-OBS-001 | warning  | `dapr.yaml` has no `configFilePath:` referencing a `Configuration` resource, and no tracing `Configuration` exists in `resources/` | The sidecar emits no workflow / conversation spans, so agent runs cannot be traced. (Warning rather than critical for .NET: the `create-agent-dotnet` scaffold does not add tracing by default.) | Add `configFilePath: ./resources/tracing.yaml` and a `tracing.yaml` with a Zipkin or OTLP exporter — see [`agent-tracing-zipkin.md`](./agent-tracing-zipkin.md) / [`agent-tracing-otlp.md`](./agent-tracing-otlp.md). |
| DAG-OBS-002 | warning  | The tracing `Configuration` has `samplingRate: "0"` | Tracing is disabled; spans are dropped before export. | Set `samplingRate: "1"` in dev or `"0.1"`–`"0.05"` in production. |
| DAG-OBS-004 | warning  | `dapr.yaml` missing `logLevel:` key in the `common:` block | Falls back to an implicit default; harder to diagnose and reproduce. | Add `logLevel: info` explicitly (use `debug` only when diagnosing). |
| DAG-OBS-006 | info     | `dapr.yaml` `metricsPort:` not set on any app | Sidecar metrics port is not stable; the Prometheus scrape config cannot be asserted. | Set `metricsPort: 9090` (unique per app in multi-app projects). See [`agent-metrics-prometheus.md`](./agent-metrics-prometheus.md). |
| DAG-OBS-007 | info     | `README.md` does not mention the Diagrid Dev Dashboard or a trace UI (Zipkin / Catalyst) | Users do not discover where to inspect runs. | Add a short section linking the Dev Dashboard / trace UI and the metrics endpoint. |
| DAG-OBS-009 | warning  | A non-Development `appsettings*.json` (or `appsettings.json` without a Development override) sets `Debug` or `Trace` for `Default`, `Diagrid`, or `Diagrid.AI` under `Logging:LogLevel` | At `Debug` the library logs full prompts, agent responses, tool arguments, and tool results — typically PII and possibly secrets — into the application log pipeline. | Keep `Diagrid.AI` at `Information` or higher outside local development; enable `Debug` only in `appsettings.Development.json`. |
| DAG-OBS-010 | info     | No OpenTelemetry registration (`AddOpenTelemetry(`, `UseOtlpExporter(`, or an Aspire `AddServiceDefaults(`) in `agent_files` | The baggage the library sets (`agent.name`, `tool.name`, …) and app-level spans are only exported when the app registers OpenTelemetry; without it only the sidecar's spans exist. | Register OpenTelemetry tracing with an OTLP exporter and add a processor that copies the `agent.*` / `tool.*` baggage onto spans if you want them as span attributes. |

## Confidence notes

- DAG-OBS-001 — Opt-out is allowed. If `dapr.yaml` carries an explicit `# observability: off` comment, or the README documents an external observability vendor, or the project runs on Catalyst (managed tracing), downgrade to `info`.
- DAG-OBS-009 — Only `Debug`/`Trace` levels that would apply to the `Diagrid.AI.*` categories count. A `Debug` level scoped to an unrelated category is not a finding.

## Cross-reference

Tool-level rules: `review-agent-tools-dotnet.md`. Memory rules: `review-agent-memory-dotnet.md`. Orchestration rules: `review-agent-orchestration-dotnet.md`.
