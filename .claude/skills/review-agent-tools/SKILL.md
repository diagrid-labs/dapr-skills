---
name: review-agent-tools
description: This skill reviews Dapr Agents tool implementations for idempotency, input validation, docstring quality, and convention violations. Use this skill when the user asks to "review agent tools", "check tool idempotency", "audit Dapr agent tools", or similar.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Dapr Agents — Tools

## Overview

Scans tool definitions used by Dapr Agents (native `dapr-agents` and framework wrappers) for idempotency issues, missing docstrings / descriptions, unbounded return payloads, swallowed exceptions, and convention violations. Read-only: this skill never modifies source files. Memory configuration is covered by `review-agent-memory`; multi-agent orchestration by `review-agent-orchestration`; observability by `review-agent-observability`.

## Execution Order

You MUST follow these phases in strict order. Do not load files outside the agreed scope, and do not write or edit any files.

1. **Resolve scope** — Read [`../shared/review-scope-prompt.md`](../shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../shared/review-detect-target-agent.md`](../shared/review-detect-target-agent.md) and follow it to produce `language`, `flavor`, and `tool_files`. If `tool_files` is empty, emit a single warning finding (no tool files found) and stop.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `python` → [`../shared/review-agent-tools-python.md`](../shared/review-agent-tools-python.md)
   - `dotnet` → [`../shared/review-agent-tools-dotnet.md`](../shared/review-agent-tools-dotnet.md)
4. **Scan** — For each tool file in scope, apply every rule from the loaded checklist using `Grep` and `Read`. For each match, capture `file:line`, the rule id, and a short evidence snippet. Confirm the match is inside a tool body (the function decorated with `@tool` / wrapped with `AIFunctionFactory.Create`) before promoting it from "Please verify" to a graded severity.
5. **Report** — Format every finding using the canonical template from [`../shared/review-report-format.md`](../shared/review-report-format.md). Group by severity, then rule id, then file path.
6. **Show final message** — Your last output is the report. Do not append a summary, follow-up question, or next-action prompt other than the `## Next steps` block defined by the report format.

## Prerequisites

- Read access to the project directory.
- No build, compile, or run step is required — this skill is fully static.

## Allowed tools

`Read`, `Grep`, `Glob` only. The skill MUST NOT call `Bash`, `Write`, or `Edit`.

## Rules

The full rule list, including detection patterns, severities, and suggested fixes, lives in the loaded language checklist:

- [Python rules](../shared/review-agent-tools-python.md) — `DAG-TOOL-001` … `DAG-TOOL-013`
- [.NET rules](../shared/review-agent-tools-dotnet.md) — `DAG-TOOL-001` … `DAG-TOOL-013`

Rule ids are stable across releases. New rules append; deprecated rule ids are reserved.

## Show final message

The last thing you emit MUST be the report from step 5, including the `## Next steps` section. The `## Next steps` block should suggest:

- Run `review-agent-memory` next if it has not yet been run on this scope.
- Run `review-agent-orchestration` if the project has multiple agents.
- Run `review-agent-observability` if the project uses native `dapr-agents`.
- Re-run this skill after fixes if any critical findings were reported.

Do not add any text after the report.
