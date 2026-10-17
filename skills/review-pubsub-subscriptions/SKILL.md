---
name: review-pubsub-subscriptions
description: Reviews Dapr pub/sub subscriptions and handlers in .NET and Python (declarative, programmatic, streaming) for CloudEvent handling, response statuses, idempotency, dead-letter handling and duplicate subscriptions. Use for "review my Dapr subscribers" or "check pub/sub handlers for idempotency".
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Dapr Pub/sub — Subscriptions and Handlers

## Overview

Reviews how an app receives Dapr pub/sub messages: declarative `kind: Subscription` files, programmatic subscriptions (`[Topic]`, `.WithTopic`, `DaprApp.subscribe`) and streaming subscriptions (`Dapr.Messaging`, `subscribe_with_handler`). Checks CloudEvent handling, `SUCCESS` / `RETRY` / `DROP` responses, idempotency, dead-letter handling, `match` expressions, the same topic subscribed through two types, and declarative routes that have no endpoint. Read-only: this skill never modifies source files. Publishing code and component configuration are out of scope and are covered by `review-pubsub-publishing` and `review-pubsub-components`.

## Execution Order

You MUST follow these phases in strict order. Do not load files outside the agreed scope, and do not write or edit any files.

1. **Resolve scope** — Read [`../dapr-shared/review-scope-prompt.md`](../dapr-shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../dapr-shared/review-detect-target-pubsub.md`](../dapr-shared/review-detect-target-pubsub.md) and follow it to produce `language`, `subscriptions`, `handler_files`, `subscription_files`, plus `publisher_files` and `run_files` as context. If `subscriptions` is empty, emit the "Nothing to review" report defined in `review-report-format.md` with the reason `no pub/sub subscription files found in <scope_root>` (no rule id, not counted in `Found:`) and stop.
3. **Load checklist** — Based on `language`, read exactly one of:
   - `dotnet` or `aspire` → [`../dapr-shared/review-pubsub-subscriptions-dotnet.md`](../dapr-shared/review-pubsub-subscriptions-dotnet.md)
   - `python` → [`../dapr-shared/review-pubsub-subscriptions-python.md`](../dapr-shared/review-pubsub-subscriptions-python.md)
4. **Apply rules per type** — Group `subscriptions` by `type` (`declarative`, `programmatic`, `streaming`). For each group, apply only the rules whose **Types** column includes that type (HTTP means declarative or programmatic) to the entries and their handlers. Then run the **cross-type pass** over all subscriptions together:
   - `DPS-SUB-014` — the same pubsub and topic subscribed through two or more types in one app. Resolve `scopes` to app ids first.
   - `DPS-SUB-015` — a declarative `routes.default` or `rules[].path` with no matching POST endpoint in the app it is scoped to.
5. **Report** — Format every finding using the canonical template from [`../dapr-shared/review-report-format.md`](../dapr-shared/review-report-format.md). Group by severity, then rule id, then file path. Put low-confidence findings (indirect side effects, handler files outside the scope) under `## Please verify`.
6. **Show final message** — Your last output is the report. Do not append a summary, follow-up question, or next-action prompt other than the `## Next steps` block defined by the report format.

## Prerequisites

- Read access to the project directory.
- No build, compile, or run step is required — this skill is fully static.

## Allowed tools

`Read`, `Grep`, `Glob` only. The skill MUST NOT call `Bash`, `Write`, or `Edit`.

## Rules

The full rule list, including detection patterns, severities, applicable subscription types and suggested fixes, lives in the loaded language checklist:

- [.NET / Aspire rules](../dapr-shared/review-pubsub-subscriptions-dotnet.md) — `DPS-SUB-001` … `DPS-SUB-016`
- [Python rules](../dapr-shared/review-pubsub-subscriptions-python.md) — `DPS-SUB-001` … `DPS-SUB-016`

A rule id that applies to only one language is reserved on the other side (`DPS-SUB-001` and `DPS-SUB-003` are .NET-only; `DPS-SUB-011`, `DPS-SUB-013` and `DPS-SUB-016` are Python-only). Rule ids are stable across releases. New rules append; deprecated rule ids are reserved. Never reuse `DWF-*` or `DAG-*` ids.

Follow the checklist's streaming notes and confidence notes: never describe `DROP` as silently discarded, never report a missing `appPort` for a streaming-only app, and do not suggest `Drop` for malformed JSON on a .NET streaming handler.

If the scope has both .NET and Python apps, produce one report per language.

## Show final message

The last thing you emit MUST be the report from step 5, including the `## Next steps` section. The `## Next steps` block should suggest:

- Run `review-pubsub-components` next if it has not yet been run on this scope.
- Run `review-pubsub-publishing` next if any publisher files exist.
- Re-run this skill after fixes if any critical findings were reported.

Do not add any text after the report.
