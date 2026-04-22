---
name: review-agent-orchestration
description: This skill reviews multi-agent Dapr Agents orchestration for pub/sub topic conventions, loop safety, and handoff correctness. Use this skill when the user asks to "review agent orchestration", "check multi-agent handoffs", "audit agent pub/sub", or similar.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Dapr Agents — Orchestration

## Overview

Scans multi-agent projects (coordinator + specialists) for pub/sub topic naming conventions, loop safety (`max_iterations`), agent-registry wiring, port collisions in `dapr.yaml`, and cross-agent shared-state hazards. Read-only. Single-agent projects receive zero findings.

## Execution Order

You MUST follow these phases in strict order.

1. **Resolve scope** — Read [`../shared/review-scope-prompt.md`](../shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../shared/review-detect-target-agent.md`](../shared/review-detect-target-agent.md). If `topology == single-agent`, emit `No issues found.` and stop.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `python` → [`../shared/review-agent-orchestration-python.md`](../shared/review-agent-orchestration-python.md)
   - `dotnet` → [`../shared/review-agent-orchestration-dotnet.md`](../shared/review-agent-orchestration-dotnet.md)
4. **Scan** — Apply every rule. Port-collision rules require parsing `dapr.yaml`; topic-routing rules require grepping for `publish_topic=` / `subscribe_topic=` / `DaprClient.PublishEventAsync(`.
5. **Report** — Format findings using [`../shared/review-report-format.md`](../shared/review-report-format.md).
6. **Show final message** — Emit the report from step 5 with a `## Next steps` block.

## Prerequisites

- Read access to the project directory.

## Allowed tools

`Read`, `Grep`, `Glob` only.

## Rules

- [Python rules](../shared/review-agent-orchestration-python.md) — `DAG-ORCH-001` … `DAG-ORCH-009`
- [.NET rules](../shared/review-agent-orchestration-dotnet.md) — shared subset of `DAG-ORCH-*` (see the rule-id map in the Python file)

## Show final message

The last thing you emit MUST be the report from step 5. `## Next steps` should suggest:

- Run `review-agent-tools` and `review-agent-memory` next if not yet run.
- Run `review-agent-observability` for native `dapr-agents` projects.
- Re-run this skill after fixing critical findings.

Do not add any text after the report.
