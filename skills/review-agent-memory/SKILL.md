---
name: review-agent-memory
description: Reviews agent memory and state-store configuration for correctness. Use for "review agent memory", "check state store config" or "audit agent persistence".
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Agents — Memory and State

## Overview

Scans agent memory and state-store configuration (component YAMLs + in-code wiring) for correctness: exactly one actor state store (`actorStateStore: "true"`) for the workflow engine, memory and state wiring that really persists (native `dapr-agents` memory is per run and moves to the state store whenever `state` is set; `diagrid` wrappers keep history per workflow instance only), helper stores that point at loaded components, exact component names for auto-discovery, stable agent names, and secret management for LLM and Catalyst keys. Read-only: this skill never modifies source files.

## Execution Order

You MUST follow these phases in strict order.

1. **Resolve scope** — Read [`../dapr-shared/review-scope-prompt.md`](../dapr-shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../dapr-shared/review-detect-target-agent.md`](../dapr-shared/review-detect-target-agent.md) and follow it to produce `language`, `flavor`, `agent_files`, and `component_files`.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `python` → [`../dapr-shared/review-agent-memory-python.md`](../dapr-shared/review-agent-memory-python.md)
   - `dotnet` → [`../dapr-shared/review-agent-memory-dotnet.md`](../dapr-shared/review-agent-memory-dotnet.md)
4. **Scan** — Apply every rule from the loaded checklist to agent files and component YAMLs. For Python, apply each rule only to files of the flavor it lists; in a `mixed` project, use each file's own flavor. Cross-reference: a rule about a component is only valid if the component name is referenced in code (or conventionally expected, like `agent-workflow`).
5. **Report** — Format findings using [`../dapr-shared/review-report-format.md`](../dapr-shared/review-report-format.md). Group by severity, then rule id, then file path.
6. **Show final message** — Emit the report from step 5 with a `## Next steps` block.

## Prerequisites

- Read access to the project directory.
- No build, compile, or run step required.

## Allowed tools

`Read`, `Grep`, `Glob` only.

## Rules

- [Python rules](../dapr-shared/review-agent-memory-python.md) — `DAG-MEM-001` … `DAG-MEM-015` (`DAG-MEM-004` and `DAG-MEM-005` are retired for Python)
- [.NET rules](../dapr-shared/review-agent-memory-dotnet.md) — `DAG-MEM-001`, `DAG-MEM-003` … `DAG-MEM-007` (`DAG-MEM-002` and `DAG-MEM-008` … `DAG-MEM-015` are Python-only)

## Show final message

The last thing you emit MUST be the report from step 5. `## Next steps` should suggest:

- Run `review-agent-tools` next if not yet run.
- Run `review-agent-orchestration` for multi-agent projects.
- Run `review-agent-observability` for every Python project, native `dapr-agents` and `diagrid` wrapper alike.
- Re-run this skill after fixing any critical findings.

Do not add any text after the report.
