---
name: review-workflow-management
description: This skill reviews the HTTP management endpoints (start, status, terminate, pause, resume, raise-event, purge) that an app exposes for Dapr Workflows. Use this skill when the user asks to "review workflow management", "audit workflow management API", "check workflow HTTP endpoints", or similar.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Dapr Workflow — Management Endpoints

## Overview

Reviews the HTTP/gRPC management surface a Dapr Workflow app exposes (start, get-status, terminate, pause, resume, raise-event, purge). Checks for missing endpoints, divergent response shapes, missing auth, hard-coded ids, blocking await patterns, and unscoped error handling. Read-only: this skill never modifies source files. Workflow body code and activity bodies are out of scope and are covered by `review-workflow-determinism` and `review-workflow-activity`.

## Execution Order

You MUST follow these phases in strict order. Do not load files outside the agreed scope, and do not write or edit any files.

1. **Resolve scope** — Read [`../shared/review-scope-prompt.md`](../shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../shared/review-detect-target.md`](../shared/review-detect-target.md) and follow it to produce `language`, `management_files`, and `workflow_files`. If `management_files` is empty, emit a single critical finding (`DWF-MGT-001` — no management endpoints found) and stop.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `dotnet` or `aspire` → [`../shared/review-management-dotnet.md`](../shared/review-management-dotnet.md)
   - `python` → [`../shared/review-management-python.md`](../shared/review-management-python.md)
4. **Required-coverage pass** — Determine which of the canonical endpoints are present by grepping `management_files` for the SDK calls listed in the checklist's "Required endpoint coverage" table. Emit a finding for each missing endpoint using the rule id from that table. If `workflow_files` references `WaitForExternalEventAsync` / `wait_for_external_event`, also enforce the raise-event endpoint (`DWF-MGT-006`).
5. **Per-endpoint pass** — For every endpoint that is present, walk the per-rule heuristics (`DWF-MGT-007` and onward) and emit findings for each match.
6. **Report** — Format every finding using the canonical template from [`../shared/review-report-format.md`](../shared/review-report-format.md). Group by severity, then rule id, then file path.
7. **Show final message** — Your last output is the report. Do not append a summary, follow-up question, or next-action prompt other than the `## Next steps` block defined by the report format.

## Prerequisites

- Read access to the project directory.
- No build, compile, or run step is required — this skill is fully static.

## Allowed tools

`Read`, `Grep`, `Glob` only. The skill MUST NOT call `Bash`, `Write`, or `Edit`.

## Rules

The full rule list, including detection patterns, severities, and suggested fixes, lives in the loaded language checklist:

- [.NET / Aspire rules](`../shared/review-management-dotnet.md`) — `DWF-MGT-001` … `DWF-MGT-015`
- [Python rules](`../shared/review-management-python.md`) — `DWF-MGT-001` … `DWF-MGT-015`

Rule ids are stable across releases. New rules append; deprecated rule ids are reserved.

## Show final message

The last thing you emit MUST be the report from step 6, including the `## Next steps` section. The `## Next steps` block should suggest:

- Run `review-workflow-determinism` next if it has not yet been run on this scope.
- Run `review-workflow-activity` next if any activity files exist.
- Re-run this skill after fixes if any critical findings were reported.

Do not add any text after the report.
