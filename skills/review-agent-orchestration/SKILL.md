---
name: review-agent-orchestration
description: Reviews multi-agent orchestration for pub/sub topic conventions, loop safety and handoff correctness. Use for "review agent orchestration" or "check multi-agent handoffs".
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Agents — Orchestration

## Overview

Scans multi-agent projects (coordinator + specialists) for pub/sub topic loops and naming, loop safety (`max_iterations` / `max_steps`), agent-registry wiring (including native coordinators with wrapper specialists), wrapper pub/sub wiring, port collisions in `dapr.yaml`, and cross-agent shared-state hazards. Read-only. Single-agent projects get the nothing-to-review result, except Python `diagrid` wrapper projects whose single-agent classification is uncertain, which get one `DAG-ORCH-010` "Please verify" finding.

## Execution Order

You MUST follow these phases in strict order.

1. **Resolve scope** — Read [`../dapr-shared/review-scope-prompt.md`](../dapr-shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../dapr-shared/review-detect-target-agent.md`](../dapr-shared/review-detect-target-agent.md). If `topology == single-agent`:
   - `topology_unverified == true` → the report's only finding is `DAG-ORCH-010` under `## Please verify` (see the Python checklist); stop.
   - otherwise → emit the report with the generic nothing-to-review line from [`../dapr-shared/review-report-format.md`](../dapr-shared/review-report-format.md) (reason: single-agent project, orchestration rules do not apply; no rule id); stop.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `python` → [`../dapr-shared/review-agent-orchestration-python.md`](../dapr-shared/review-agent-orchestration-python.md)
   - `dotnet` → [`../dapr-shared/review-agent-orchestration-dotnet.md`](../dapr-shared/review-agent-orchestration-dotnet.md)
4. **Scan** — Apply every rule. Port-collision rules require parsing `dapr.yaml`; topic-routing rules require grepping for `AgentPubSubConfig(` / `agent_topic=` / `broadcast_topic=` (native Python), `pubsub_name=` / `publish_topic=` / `subscribe_topic=` (wrapper Python), or `DaprClient.PublishEventAsync(` (.NET); registry and dispatch rules for `orchestration_mode=`, `AgentRegistryConfig(` / `registry_config=` and `AsyncSubAgent(`; loop-bound rules for `AgentExecutionConfig(` / `max_iterations=` / `max_steps=`. In a Python `mixed` project, apply each rule to each file by that file's flavor.
5. **Report** — Format findings using [`../dapr-shared/review-report-format.md`](../dapr-shared/review-report-format.md).
6. **Show final message** — Emit the report from step 5 with a `## Next steps` block.

## Prerequisites

- Read access to the project directory.

## Allowed tools

`Read`, `Grep`, `Glob` only.

## Rules

- [Python rules](../dapr-shared/review-agent-orchestration-python.md) — `DAG-ORCH-001` … `DAG-ORCH-014` (`DAG-ORCH-008` is retired; never emit it)
- [.NET rules](../dapr-shared/review-agent-orchestration-dotnet.md) — shared subset of `DAG-ORCH-*` (see the rule-id map in the Python file)

## Show final message

The last thing you emit MUST be the report from step 5. `## Next steps` should suggest:

- Run `review-agent-tools` and `review-agent-memory` next if not yet run.
- Run `review-agent-observability` for every Python project (native, wrapper, or mixed).
- Re-run this skill after fixing critical findings.

Do not add any text after the report.
