---
name: review-agent-observability
description: Reviews agent projects for tracing, metrics, structured logging and trace propagation. Use for "review agent observability" or "audit agent tracing".
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Agents — Observability

## Overview

Scans agent projects for observability completeness: Dapr tracing Configuration present, sampling rate non-zero, structured logging in use, explicit log level, trace-id propagation on outbound tool calls, and README guidance for trace / metrics UIs. Python projects are also checked for app-level OpenTelemetry: `agent_observability=` for native `dapr-agents`, and the built-in OTLP export of the `diagrid` framework wrappers (endpoint, gRPC protocol, `serve()`, service name).

## Execution Order

You MUST follow these phases in strict order.

1. **Resolve scope** — Read [`../dapr-shared/review-scope-prompt.md`](../dapr-shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../dapr-shared/review-detect-target-agent.md`](../dapr-shared/review-detect-target-agent.md). Continue for every flavor (`native`, wrapper and `mixed`); the Python checklist says which rules apply to which flavor, decided per agent file by its imports.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `python` → [`../dapr-shared/review-agent-observability-python.md`](../dapr-shared/review-agent-observability-python.md)
   - `dotnet` → [`../dapr-shared/review-agent-observability-dotnet.md`](../dapr-shared/review-agent-observability-dotnet.md)
4. **Scan** — Apply every rule. `dapr.yaml` (including `env:` blocks), `resources/tracing.yaml`, agent and tool file contents, `.env` files (Python), `appsettings*.json` (.NET), and `README.md` are all potentially in scope.
5. **Report** — Format findings using [`../dapr-shared/review-report-format.md`](../dapr-shared/review-report-format.md).
6. **Show final message** — Emit the report from step 5 with a `## Next steps` block.

## Prerequisites

- Read access to the project directory.

## Allowed tools

`Read`, `Grep`, `Glob` only.

## Rules

- [Python rules](../dapr-shared/review-agent-observability-python.md) — `DAG-OBS-001` … `DAG-OBS-008`, `DAG-OBS-011` … `DAG-OBS-018` (`DAG-OBS-000` is retired and reserved)
- [.NET rules](../dapr-shared/review-agent-observability-dotnet.md) — `DAG-OBS-001`, `DAG-OBS-002`, `DAG-OBS-004`, `DAG-OBS-006`, `DAG-OBS-007`, `DAG-OBS-009`, `DAG-OBS-010`

## Show final message

The last thing you emit MUST be the report from step 5. `## Next steps` should suggest:

- Run `review-agent-tools`, `review-agent-memory`, and `review-agent-orchestration` if not yet run.
- Re-run this skill after fixing critical findings.
- If the project has a `docker-compose.observability.yaml`, run it (`docker compose -f docker-compose.observability.yaml up -d`) and verify traces appear in the trace UI; if it has none, point to the `create-agent-*` skills' observability stack instead of a command.

Do not add any text after the report.
