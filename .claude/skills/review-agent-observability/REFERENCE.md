# Reference: review-agent-observability

## Sample report

For a native `dapr-agents` project whose `dapr.yaml` does not reference a tracing Configuration and whose `tools.py` uses bare `print`:

```
# Dapr review — review-agent-observability

Target: /Users/x/my-agent
Language: python
Found: 1 critical, 2 warnings, 2 suggestions, 0 to verify

## Critical
- [DAG-OBS-001] `dapr.yaml:1` — no configFilePath referencing a Configuration resource with tracing
  Why: Agent runs are unobservable; no spans emitted; incidents cannot be diagnosed.
  Fix: Add `configFilePath: ./resources/tracing.yaml` and create tracing.yaml (see shared/agent-tracing-zipkin.md).

## Warnings
- [DAG-OBS-003] `my-agent-agent/tools.py:12` — bare print() inside tool body
  Why: Bypasses structured logging; loses trace-id correlation.
  Fix: Replace with `logging.getLogger(__name__).info(...)`.
- [DAG-OBS-004] `dapr.yaml:1` — logLevel not set in common block
  Why: Falls back to implicit default; harder to diagnose and reproduce.
  Fix: Add `logLevel: info` explicitly.

## Suggestions
- [DAG-OBS-006] `dapr.yaml:1` — metricsPort not set on any app
  Why: Sidecar metrics port is not stable; Prometheus scrape config cannot be asserted.
  Fix: Add `metricsPort: 9090` on the app.
- [DAG-OBS-007] `README.md:1` — no Diagrid Dev Dashboard or trace UI link
  Why: Users do not discover the trace UI.
  Fix: Add a short section linking http://localhost:9411 (Zipkin) and the Diagrid Dev Dashboard.

## Next steps
- Run `review-agent-memory` next for the same scope.
- Re-run this skill after fixing the DAG-OBS-001 finding.
```

## Framework-wrapper fallback

If the detected `flavor` is `framework-wrapper`, the report body is a single entry:

```
## Suggestions
- [DAG-OBS-000] `pyproject.toml:1` — framework wrapper detected (<framework>); observability is delegated to the wrapped framework.
  Why: Wrapper frameworks (LangGraph, CrewAI, OpenAI Agents, etc.) ship their own observability (LangSmith, Arize, OpenAI traces); duplicating Dapr-side observability adds noise.
  Fix: Configure observability via the wrapper framework's recommended path and skip this review.
```

No scan runs; the skill stops immediately after emitting this finding.
