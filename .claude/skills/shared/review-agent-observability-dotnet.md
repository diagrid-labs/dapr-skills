# Agent Observability Checklist — .NET (stub)

Observability review for .NET Dapr Agents is not yet implemented. The skill currently loads this checklist to preserve the "every review skill loads a language-specific checklist before emitting any finding" invariant.

`review-agent-observability` emits exactly one finding when this checklist is loaded.

| Rule id     | Severity | What to detect                                                 | Why it matters                                                                                  | Suggested fix                                                                                 |
| ----------- | -------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| DAG-OBS-000 | info     | .NET agent project encountered (native Dapr Agents SDK for .NET does not exist) | Observability for .NET agents is handled by the wrapped framework (Microsoft Agent Framework + OpenTelemetry) or the Diagrid Catalyst dashboard, not by an OSS-Dapr-native path. | Configure observability via the wrapped framework's recommended path (`Microsoft.Extensions.AI` + OpenTelemetry) or enable Catalyst's managed observability. |

## Confidence notes

- This is a placeholder checklist. When native .NET observability guidance is authored (tracing config via `Microsoft.Extensions.AI`, structured logging with `ILogger<T>`, metrics export), replace `DAG-OBS-000` with concrete rules and keep the id reserved.

## Cross-reference

The Python checklist (`review-agent-observability-python.md`) covers the full set of rules (`DAG-OBS-001` through `DAG-OBS-008`). Many rules translate directly to .NET — this file should grow to mirror them once a canonical .NET observability path is agreed.
