---
name: review-pubsub-publishing
description: This skill reviews Dapr pub/sub publishing code in .NET and Python for unawaited or swallowed publish failures, wrong pub/sub names, content types, client lifetime, bulk-publish partial failures, tracing overrides and payload size. Use this skill when the user asks to "review my pub/sub publishing code", "audit Dapr publish calls" or similar.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Dapr Pub/sub — Publishing

## Overview

Reviews the code that publishes events through Dapr pub/sub (`PublishEventAsync`, `BulkPublishEventAsync`, `publish_event`, `publish_events`, raw `/v1.0/publish/` calls). Checks for unawaited or swallowed publish failures, a pub/sub name that matches no component, missing content types, client lifetime problems, ignored bulk-publish failures, tracing overrides and large payloads. Read-only: this skill never modifies source files. Subscribers, handlers and component YAML are out of scope and are covered by `review-pubsub-subscriptions` and `review-pubsub-components`.

## Execution Order

You MUST follow these phases in strict order. Do not load files outside the agreed scope, and do not write or edit any files.

1. **Resolve scope** — Read [`../dapr-shared/review-scope-prompt.md`](../dapr-shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../dapr-shared/review-detect-target-pubsub.md`](../dapr-shared/review-detect-target-pubsub.md) and follow it to produce `language`, `publisher_files` and `component_files`. If `publisher_files` is empty, emit the "Nothing to review" report defined in `review-report-format.md` with the reason `no pub/sub publishing files found in <scope_root>` (no rule id, not counted in `Found:`) and stop.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `dotnet` or `aspire` → [`../dapr-shared/review-pubsub-publishing-dotnet.md`](../dapr-shared/review-pubsub-publishing-dotnet.md)
   - `python` → [`../dapr-shared/review-pubsub-publishing-python.md`](../dapr-shared/review-pubsub-publishing-python.md)
4. **Apply rules** — Walk every file in `publisher_files` against `DPS-PUB-001` … `DPS-PUB-012` as the checklist defines them. Resolve constants (`PubSubNames.PubSubName`, `PUBSUB_NAME`) before comparing names with `component_files`. Rules marked "reserved" for the loaded language do not apply. Honour the checklist's confidence notes: low-confidence matches go under `## Please verify`, never under `## Critical`.
5. **Report** — Format every finding using the canonical template from [`../dapr-shared/review-report-format.md`](../dapr-shared/review-report-format.md). Group by severity, then rule id, then file path. If the scope holds more than one language, produce one report per language.
6. **Show final message** — Your last output is the report. Do not append a summary, follow-up question, or next-action prompt other than the `## Next steps` block defined by the report format.

## Prerequisites

- Read access to the project directory.
- No build, compile, or run step is required — this skill is fully static.

## Allowed tools

`Read`, `Grep`, `Glob` only. The skill MUST NOT call `Bash`, `Write`, or `Edit`.

## Rules

The full rule list, including detection patterns, severities, and suggested fixes, lives in the loaded language checklist:

- [.NET / Aspire rules](../dapr-shared/review-pubsub-publishing-dotnet.md) — `DPS-PUB-001` … `DPS-PUB-012` (`004` and `011` reserved)
- [Python rules](../dapr-shared/review-pubsub-publishing-python.md) — `DPS-PUB-001` … `DPS-PUB-012`

Rule ids are stable across releases. New rules append; deprecated rule ids are reserved.

## Show final message

The last thing you emit MUST be the report from step 5, including the `## Next steps` section. The `## Next steps` block should suggest:

- Run `review-pubsub-subscriptions` next if it has not yet been run on this scope.
- Run `review-pubsub-components` next if component, subscription or resiliency YAML exists.
- Re-run this skill after fixes if any critical findings were reported.

Do not add any text after the report.
