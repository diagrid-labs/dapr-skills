---
name: review-agent-memory
description: This skill reviews Dapr Agents memory and state-store configuration for correctness. Use this skill when the user asks to "review agent memory", "check state store config", "audit agent persistence", or similar.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Dapr Agents — Memory and State

## Overview

Scans agent memory and state-store configuration (component YAMLs + in-code wiring) for correctness: `actorStateStore: "true"` on the workflow state store, appropriate memory class selection, secret management on LLM keys, and no component collisions between conversation memory and workflow state. Read-only: this skill never modifies source files.

## Execution Order

You MUST follow these phases in strict order.

1. **Resolve scope** — Read [`../shared/review-scope-prompt.md`](../shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../shared/review-detect-target-agent.md`](../shared/review-detect-target-agent.md) and follow it to produce `language`, `flavor`, `agent_files`, and `component_files`.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `python` → [`../shared/review-agent-memory-python.md`](../shared/review-agent-memory-python.md)
   - `dotnet` → [`../shared/review-agent-memory-dotnet.md`](../shared/review-agent-memory-dotnet.md)
4. **Scan** — Apply every rule from the loaded checklist to agent files and component YAMLs. Cross-reference: a rule about a component is only valid if the component name is referenced in code (or conventionally expected, like `agent-workflow`).
5. **Report** — Format findings using [`../shared/review-report-format.md`](../shared/review-report-format.md). Group by severity, then rule id, then file path.
6. **Show final message** — Emit the report from step 5 with a `## Next steps` block.

## Prerequisites

- Read access to the project directory.
- No build, compile, or run step required.

## Allowed tools

`Read`, `Grep`, `Glob` only.

## Rules

- [Python rules](../shared/review-agent-memory-python.md) — `DAG-MEM-001` … `DAG-MEM-008`
- [.NET rules](../shared/review-agent-memory-dotnet.md) — `DAG-MEM-001` … `DAG-MEM-007`

## Show final message

The last thing you emit MUST be the report from step 5. `## Next steps` should suggest:

- Run `review-agent-tools` next if not yet run.
- Run `review-agent-orchestration` for multi-agent projects.
- Run `review-agent-observability` for native `dapr-agents` projects.
- Re-run this skill after fixing any critical findings.

Do not add any text after the report.
