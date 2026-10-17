---
name: review-agent-tools
description: Reviews agent tool implementations for idempotency, input validation, docstring quality and conventions. Use for "review agent tools" or "check tool idempotency".
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Agents — Tools

## Overview

Scans agent tool definitions for idempotency issues, missing docstrings / descriptions, unbounded return payloads, swallowed exceptions, and convention violations. Applies to both supported paths: the Python [`dapr-agents`](https://github.com/dapr/dapr-agents) SDK and `diagrid[<extra>]` wrappers, and .NET Microsoft Agent Framework agents running on Dapr Workflow. "Dapr Agents" is the Python framework specifically — it has no .NET SDK. Read-only: this skill never modifies source files. Memory configuration is covered by `review-agent-memory`; multi-agent orchestration by `review-agent-orchestration`; observability by `review-agent-observability`.

## Execution Order

You MUST follow these phases in strict order. Do not load files outside the agreed scope, and do not write or edit any files.

1. **Resolve scope** — Read [`../dapr-shared/review-scope-prompt.md`](../dapr-shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../dapr-shared/review-detect-target-agent.md`](../dapr-shared/review-detect-target-agent.md) and follow it to produce `language`, `flavor`, `file_flavors`, `wrapper_frameworks`, and `tool_files`. If `tool_files` is empty, there is nothing to review: emit the report with the generic nothing-to-review line from [`../dapr-shared/review-report-format.md`](../dapr-shared/review-report-format.md) (reason: no tool definitions found in scope — none of the per-framework tool markers listed in `review-detect-target-agent.md` (`@tool`, `@function_tool`, `FunctionTool(`, `@<agent>.tool`, tool classes, functions in `tools=[...]`, …) or `AIFunctionFactory.Create(`). It carries no rule id and no severity. Stop.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `python` → [`../dapr-shared/review-agent-tools-python.md`](../dapr-shared/review-agent-tools-python.md)
   - `dotnet` → [`../dapr-shared/review-agent-tools-dotnet.md`](../dapr-shared/review-agent-tools-dotnet.md)
4. **Scan** — For each tool file in scope, apply every rule from the loaded checklist using `Grep` and `Read`. For each match, capture `file:line`, the rule id, and a short evidence snippet. Confirm the match is inside a tool body (as defined in `review-detect-target-agent.md` for Python, or the method wrapped with `AIFunctionFactory.Create` for .NET) before promoting it from "Please verify" to a graded severity. In a `mixed` Python project, apply each rule with the flavor of the file being scanned.
5. **Report** — Format every finding using the canonical template from [`../dapr-shared/review-report-format.md`](../dapr-shared/review-report-format.md). Group by severity, then rule id, then file path.
6. **Show final message** — Your last output is the report. Do not append a summary, follow-up question, or next-action prompt other than the `## Next steps` block defined by the report format.

## Prerequisites

- Read access to the project directory.
- No build, compile, or run step is required — this skill is fully static.

## Allowed tools

`Read`, `Grep`, `Glob` only. The skill MUST NOT call `Bash`, `Write`, or `Edit`.

## Rules

The full rule list, including detection patterns, severities, and suggested fixes, lives in the loaded language checklist:

- [Python rules](../dapr-shared/review-agent-tools-python.md) — `DAG-TOOL-001` … `DAG-TOOL-013`, `DAG-TOOL-016` … `DAG-TOOL-018`
- [.NET rules](../dapr-shared/review-agent-tools-dotnet.md) — `DAG-TOOL-001` … `DAG-TOOL-008`, `DAG-TOOL-011` … `DAG-TOOL-015`

Rule ids are stable across releases. New rules append; deprecated rule ids are reserved.

## Show final message

The last thing you emit MUST be the report from step 5, including the `## Next steps` section. The `## Next steps` block should suggest:

- Run `review-agent-memory` next if it has not yet been run on this scope.
- Run `review-agent-orchestration` if the project has multiple agents.
- Run `review-agent-observability` for every Python project (native, wrapper or mixed) and for .NET projects.
- Re-run this skill after fixes if any critical findings were reported.

Do not add any text after the report.
