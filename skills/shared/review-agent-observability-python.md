# Agent Observability Checklist — Python (native dapr-agents only)

Apply these rules only when `flavor == native`. For `framework-wrapper` projects, emit a single `info` finding that observability is handled by the wrapped framework (LangSmith / Arize / OpenAI traces) and stop.

Rule source: see [`../create-agent-python/REFERENCE.md`](../create-agent-python/REFERENCE.md) — section "Observability".

| Rule id     | Severity | What to detect                                                                                                                                      | Why it matters                                                                                      | Suggested fix                                                                                         |
| ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| DAG-OBS-001 | critical | `dapr.yaml` has no `configFilePath:` referencing a `Configuration` resource, and no `resources/tracing.yaml` file exists                           | Agent runs are unobservable; no spans emitted; incidents cannot be diagnosed.                       | Add `configFilePath: ./resources/tracing.yaml` and a `tracing.yaml` with a Zipkin or OTLP exporter.  |
| DAG-OBS-002 | warning  | `resources/tracing.yaml` has `samplingRate: "0"`                                                                                                     | Tracing is disabled; spans are dropped before export.                                                | Set `samplingRate: "1"` in dev or `"0.1"`–`"0.05"` in production.                                    |
| DAG-OBS-003 | warning  | Bare `print(` inside any `agent_files` or `tool_files`                                                                                              | Bypasses structured logging; loses trace-id correlation.                                             | Use `logging.getLogger(__name__).info(...)`.                                                         |
| DAG-OBS-004 | warning  | `dapr.yaml` missing `logLevel:` key in the `common:` block                                                                                            | Falls back to implicit default; harder to diagnose and reproduce.                                    | Add `logLevel: info` explicitly (use `debug` only when diagnosing).                                  |
| DAG-OBS-005 | warning  | A tool file makes outbound HTTP calls without forwarding `traceparent` / `tracestate` headers                                                        | Downstream services are not linked into the agent's trace; end-to-end timelines are broken.         | Inject headers from `opentelemetry.propagate.inject(headers)` before sending.                       |
| DAG-OBS-006 | info     | `dapr.yaml` `metricsPort:` not set on any app                                                                                                        | Sidecar metrics port is not stable; Prometheus scrape config cannot be asserted.                     | Set `metricsPort: 9090` (or a unique value per app in multi-agent projects).                        |
| DAG-OBS-007 | info     | `README.md` does not mention the Diagrid Dev Dashboard or a trace UI (Zipkin / Catalyst)                                                              | Users do not discover the trace UI; observability is "there but hidden".                             | Add a short section linking the trace UI (e.g. http://localhost:9411) and the metrics endpoint.     |
| DAG-OBS-008 | info     | Project has no `logging_config.py` (or equivalent JSON-logging bootstrap)                                                                            | Agent logs are plain-text; trace-id cannot be correlated against Zipkin/OTLP.                       | Add the `logging_config.py` template from `shared/agent-logging-python.md`.                         |

## Confidence notes

- DAG-OBS-001 — Opt-out is allowed. If `dapr.yaml` contains an explicit comment like `# observability: off` OR the project README documents an external observability vendor, downgrade to `info` rather than `critical`.
- DAG-OBS-005 — Heuristic; requires grepping for `httpx.` / `requests.` calls inside tool bodies and checking whether `headers=` includes `traceparent`. Default to "Please verify" when unsure.

## Cross-reference

Memory and state rules: `review-agent-memory-python.md`. Tool idempotency / docstring rules: `review-agent-tools-python.md`. Orchestration rules: `review-agent-orchestration-python.md`.
