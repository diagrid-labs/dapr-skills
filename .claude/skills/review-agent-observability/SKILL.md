---
name: review-agent-observability
description: This skill reviews Dapr Agents projects for observability completeness — tracing, metrics, structured logging, and trace propagation. Use this skill when the user asks to "review agent observability", "audit agent tracing", "check agent metrics", or similar.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Dapr Agents — Observability

## Overview

Scans native `dapr-agents` projects for observability completeness: Dapr tracing Configuration present, sampling rate non-zero, structured logging in use, explicit log level, trace-id propagation on outbound tool calls, and README guidance for trace / metrics UIs. Framework-wrapper projects (LangGraph / CrewAI / OpenAI Agents / etc.) receive a single `info` finding — those frameworks ship their own observability pipelines.

## Execution Order

You MUST follow these phases in strict order.

1. **Resolve scope** — Read [`../shared/review-scope-prompt.md`](../shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../shared/review-detect-target-agent.md`](../shared/review-detect-target-agent.md). If `flavor == framework-wrapper`, emit one `info` finding explaining that observability is delegated to the wrapped framework and stop.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `python` → [`../shared/review-agent-observability-python.md`](../shared/review-agent-observability-python.md)
   - `dotnet` → [`../shared/review-agent-observability-dotnet.md`](../shared/review-agent-observability-dotnet.md) (stub — emits a single `DAG-OBS-000` info finding)
4. **Scan** — Apply every rule. `dapr.yaml`, `resources/tracing.yaml`, tool file contents, and `README.md` are all potentially in scope.
5. **Report** — Format findings using [`../shared/review-report-format.md`](../shared/review-report-format.md).
6. **Show final message** — Emit the report from step 5 with a `## Next steps` block.

## Prerequisites

- Read access to the project directory.

## Allowed tools

`Read`, `Grep`, `Glob` only.

## Rules

- [Python rules](../shared/review-agent-observability-python.md) — `DAG-OBS-001` … `DAG-OBS-008`
- [.NET rules](../shared/review-agent-observability-dotnet.md) — `DAG-OBS-000` (stub; full checklist TBD)

## Show final message

The last thing you emit MUST be the report from step 5. `## Next steps` should suggest:

- Run `review-agent-tools`, `review-agent-memory`, and `review-agent-orchestration` if not yet run.
- Re-run this skill after fixing critical findings.
- Optionally run the observability stack locally (`docker compose -f docker-compose.observability.yaml up -d`) and verify traces appear in Zipkin.

Do not add any text after the report.
