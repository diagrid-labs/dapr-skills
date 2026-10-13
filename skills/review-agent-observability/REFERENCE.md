# Reference: review-agent-observability

## Sample report — native `dapr-agents`

For a native `dapr-agents` project whose `dapr.yaml` does not reference a tracing Configuration, whose `DurableAgent` has no `agent_observability=`, and whose `tools.py` uses bare `print`:

```
# Dapr review — review-agent-observability

Target: /Users/x/my-agent
Language: python
Found: 0 critical, 4 warnings, 2 suggestions, 0 to verify

## Warnings
- [DAG-OBS-001] `dapr.yaml:1` — no configFilePath referencing a Configuration resource with tracing
  Why: The sidecar emits no workflow / activity spans, so durable execution steps are invisible.
  Fix: Add `configFilePath: ./resources/tracing.yaml` and create tracing.yaml (see dapr-shared/agent-tracing-zipkin.md).
- [DAG-OBS-003] `my-agent-agent/tools.py:12` — bare print() inside tool body
  Why: Bypasses structured logging and the OTel LoggingHandler; loses trace-id correlation.
  Fix: Replace with `logging.getLogger(__name__).info(...)`.
- [DAG-OBS-004] `dapr.yaml:1` — logLevel not set in common block
  Why: Falls back to implicit default; harder to diagnose and reproduce.
  Fix: Add `logLevel: info` explicitly.
- [DAG-OBS-014] `my-agent-agent/main.py:18` — DurableAgent has no agent_observability= and no OTEL_* env enables it
  Why: Only sidecar spans exist; no agent, LLM-call or tool spans. An OTLP endpoint alone does not enable it.
  Fix: Pass `agent_observability=AgentObservabilityConfig(enabled=True, tracing_enabled=True, tracing_exporter=...)`.

## Suggestions
- [DAG-OBS-006] `dapr.yaml:1` — metricsPort not set on any app
  Why: Sidecar metrics port is not stable; Prometheus scrape config cannot be asserted.
  Fix: Add `metricsPort: 9090` on the app.
- [DAG-OBS-007] `README.md:1` — no Diagrid Dev Dashboard or trace UI link
  Why: Users do not discover the trace UI.
  Fix: Add a short section linking http://localhost:9411 (Zipkin) and the Diagrid Dev Dashboard.

## Next steps
- Run `review-agent-memory` next for the same scope.
- Re-run this skill after adding tracing.yaml and agent_observability=.
```

**Key points**

- Native agent observability is resolved once, in the `DurableAgent` constructor, from the `agent-runtime` state store, then `AgentObservabilityConfig.from_env()`, then `agent_observability=`. It stays off unless `enabled` and `tracing_enabled` end up `True`, and the exporter defaults to `console`. The environment equivalent is `OTEL_SDK_DISABLED=false`, `OTEL_TRACING_ENABLED=true`, `OTEL_TRACES_EXPORTER=otlp_grpc` and `OTEL_EXPORTER_OTLP_ENDPOINT`.
- A non-console exporter without an endpoint makes the constructor raise `ValueError` (`DAG-OBS-018`, critical).
- `DAG-OBS-001` is a warning for every flavor: app-level spans and sidecar spans are complementary, and neither replaces the other.

## Sample report — `diagrid` framework wrapper

For a CrewAI wrapper (`from diagrid.agent.crewai import DaprWorkflowAgentRunner`) that calls `runner.serve(...)`, has no tracing Configuration, no `logLevel`, no `metricsPort`, no README, no logging bootstrap, no `OTEL_EXPORTER_OTLP_ENDPOINT`, and a `print(` inside a tool:

```
# Dapr review — review-agent-observability

Target: /Users/x/market-research
Language: python
Found: 0 critical, 3 warnings, 4 suggestions, 0 to verify

## Warnings
- [DAG-OBS-001] `dapr.yaml:1` — no configFilePath referencing a Configuration resource with tracing
  Why: The sidecar emits no workflow / activity spans, so durable execution steps are invisible.
  Fix: Add `configFilePath: ./resources/tracing.yaml` and create tracing.yaml (see dapr-shared/agent-tracing-zipkin.md).
- [DAG-OBS-003] `market-research-agent/main.py:11` — bare print() inside the lookup_competitors tool
  Why: Bypasses structured logging and the OTel LoggingHandler; loses trace-id correlation.
  Fix: Replace with `logging.getLogger(__name__).info(...)`.
- [DAG-OBS-004] `dapr.yaml:1` — logLevel not set in common block
  Why: Falls back to implicit default; harder to diagnose and reproduce.
  Fix: Add `logLevel: info` explicitly.

## Suggestions
- [DAG-OBS-006] `dapr.yaml:5` — metricsPort not set on any app
  Why: Sidecar metrics port is not stable; Prometheus scrape config cannot be asserted.
  Fix: Add `metricsPort: 9090` on the app.
- [DAG-OBS-007] `dapr.yaml:1` — no README.md with a trace UI link
  Why: Users do not discover the trace UI.
  Fix: Add a README section linking http://localhost:9411 (Zipkin) and the Diagrid Dev Dashboard.
- [DAG-OBS-008] `market-research-agent/main.py:1` — no logging bootstrap and no OTel LoggingHandler
  Why: Agent logs are plain text; the trace id cannot be correlated.
  Fix: Add logging_config.py (dapr-shared/agent-logging-python.md) or enable OTLP log export.
- [DAG-OBS-011] `dapr.yaml:5` — no OTEL_EXPORTER_OTLP_ENDPOINT for the market-research wrapper app
  Why: Wrapper telemetry is off until an endpoint is set; serve() emits no LLM / tool / framework spans.
  Fix: Add `OTEL_EXPORTER_OTLP_ENDPOINT: http://localhost:4317` and `OTEL_SERVICE_NAME` to the app's `env:` block.

## Next steps
- Run `review-agent-tools` next for the same scope.
- Re-run this skill after setting the OTLP endpoint and tracing.yaml.
```

**Key points**

- `diagrid` wrappers have built-in OpenTelemetry. It is set up only in `runner.serve()` and stays a no-op until `OTEL_EXPORTER_OTLP_ENDPOINT` (or the `agent-runtime` state store) supplies an endpoint.
- The wrapper exporter is OTLP **gRPC** only (`DAG-OBS-012`): point it at the collector's `4317` port, not `4318`.
- Entry points that call `start()`, `run_async(`, `run_sync(` or `invoke(` instead of `serve()`, and diagrid's Strands `DurableAgent`, never set up telemetry (`DAG-OBS-015`).
- Without `OTEL_SERVICE_NAME`, most runners report `service.name` as the runner class name, usually `DaprWorkflowAgentRunner` (`DAG-OBS-016`).
- In a `mixed` project, apply the native rules to the files that import `dapr_agents` and the wrapper rules to the files that import `diagrid.agent.`; project-level rules (`dapr.yaml`, `resources/`, `README.md`) are reported once.

## Retired rule ids

- `DAG-OBS-000` — retired (it stopped the review for wrapper projects with "observability is delegated to the wrapped framework", but `diagrid` wrappers have built-in OpenTelemetry through `serve()`; replaced by `DAG-OBS-011` … `DAG-OBS-016`). The id stays reserved and is never emitted.
