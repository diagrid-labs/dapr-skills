---
name: review-workflow-activity
description: This skill reviews Dapr Workflow activity implementations for idempotency, retries, error boundaries, and convention violations. Use this skill when the user asks to "review workflow activities", "check activity idempotency", "audit Dapr activities", or similar.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Dapr Workflow — Activities

## Overview

Scans the bodies of Dapr Workflow activity classes/functions for idempotency issues, swallowed exceptions, payload size risks, cancellation handling, and convention violations. Read-only: this skill never modifies source files. Workflow body code and management endpoints are out of scope and are covered by `review-workflow-determinism` and `review-workflow-management`.

## Execution Order

You MUST follow these phases in strict order. Do not load files outside the agreed scope, and do not write or edit any files.

1. **Resolve scope** — Read [`../shared/review-scope-prompt.md`](../shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../shared/review-detect-target.md`](../shared/review-detect-target.md) and follow it to produce `language` and `activity_files`. If `activity_files` is empty, emit a single warning finding (no activity files found) and stop.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `dotnet` or `aspire` → [`../shared/review-activity-dotnet.md`](../shared/review-activity-dotnet.md)
   - `python` → [`../shared/review-activity-python.md`](../shared/review-activity-python.md)
4. **Scan** — For each activity file in scope, apply every rule from the loaded checklist using `Grep` and `Read`. For each match, capture `file:line`, the rule id, and a short evidence snippet. Confirm the match is inside an activity body (see "Cross-reference" in each checklist) before promoting it from "Please verify" to a graded severity.
5. **Report** — Format every finding using the canonical template from [`../shared/review-report-format.md`](../shared/review-report-format.md). Group by severity, then rule id, then file path.
6. **Show final message** — Your last output is the report. Do not append a summary, follow-up question, or next-action prompt other than the `## Next steps` block defined by the report format.

## Prerequisites

- Read access to the project directory.
- No build, compile, or run step is required — this skill is fully static.

## Allowed tools

`Read`, `Grep`, `Glob` only. The skill MUST NOT call `Bash`, `Write`, or `Edit`.

## Rules

The full rule list, including detection patterns, severities, and suggested fixes, lives in the loaded language checklist:

- [.NET / Aspire rules](`../shared/review-activity-dotnet.md`) — `DWF-ACT-001` … `DWF-ACT-012`
- [Python rules](`../shared/review-activity-python.md`) — `DWF-ACT-001` … `DWF-ACT-011`

Rule ids are stable across releases. New rules append; deprecated rule ids are reserved.

## Show final message

The last thing you emit MUST be the report from step 5, including the `## Next steps` section. The `## Next steps` block should suggest:

- Run `review-workflow-determinism` next if it has not yet been run on this scope.
- Run `review-workflow-management` next if any management files exist.
- Re-run this skill after fixes if any critical findings were reported.

Do not add any text after the report.
