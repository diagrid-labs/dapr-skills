---
name: review-pubsub-components
description: Reviews Dapr pub/sub configuration (components, Subscription files, resiliency, dapr.yaml and Aspire wiring) for inline secrets, unsecured brokers, dead-letter topics without retry policies, scopes and app-id or port collisions. Use for "review my pub/sub components" or "audit Dapr pubsub YAML".
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Review Dapr Pub/sub — Components and Configuration

## Overview

Reviews the configuration around Dapr pub/sub: pub/sub component YAML, declarative `Subscription` files, `Resiliency` policies, `dapr.yaml` and the Aspire AppHost. Checks for inline secrets, unauthenticated or unencrypted brokers, dead-letter topics without retry policies, missing scopes, consumer-group and stream-limit mistakes, deprecated or mis-scoped subscriptions, the ignored `isRawPayload` key, and app-id or port collisions. Read-only: this skill never modifies source files. Publisher code and subscriber handler code are out of scope and are covered by `review-pubsub-publishing` and `review-pubsub-subscriptions`.

## Execution Order

You MUST follow these phases in strict order. Do not load files outside the agreed scope, and do not write or edit any files.

1. **Resolve scope** — Read [`../dapr-shared/review-scope-prompt.md`](../dapr-shared/review-scope-prompt.md) and follow it to set `scope_root`.
2. **Detect target** — Read [`../dapr-shared/review-detect-target-pubsub.md`](../dapr-shared/review-detect-target-pubsub.md) and follow it to produce `language`, `component_files`, `subscription_files`, `resiliency_files`, `run_files`, `subscriptions` and `skipped`. Stop with the "Nothing to review" report defined in `review-report-format.md` (no rule id, not counted in `Found:`) in either case:
   - `component_files`, `subscription_files` and `resiliency_files` are all empty: reason `no pub/sub component files found in <scope_root>`.
   - The only component found is `agent-pubsub` (it sits in `skipped`): reason `only the agent-pubsub component was found`, and the Next steps point to `review-agent-orchestration`.
3. **Load checklist** — Always read [`../dapr-shared/review-pubsub-components.md`](../dapr-shared/review-pubsub-components.md). The checklist is language-neutral, so there is one file for `dotnet`, `aspire` and `python`; apply its .NET / Aspire notes or Python notes for the detected `language`.
4. **Apply rules** — Walk `component_files`, `subscription_files`, `resiliency_files` and `run_files` against rules `DPS-CFG-001` … `DPS-CFG-014`, using `subscriptions` as context (dead-letter topics, app ids, scopes). Respect each rule's severity conditions: `DPS-CFG-001` is info for a local host or an Aspire secret-parameter default, and `DPS-CFG-006` is reported under **Please verify**.
5. **Report** — Format every finding using the canonical template from [`../dapr-shared/review-report-format.md`](../dapr-shared/review-report-format.md). The `Language:` line carries the detected language. Group by severity, then rule id, then file path. Never print credential values; name the metadata key only.
6. **Show final message** — Your last output is the report. Do not append a summary or next-action prompt other than the `## Next steps` block defined by the report format. Clarifying questions are always allowed during the review (see the report format); once answered, the report is still your last output.

## Prerequisites

- Read access to the project directory.
- No build, compile, or run step is required — this skill is fully static.

## Allowed tools

`Read`, `Grep`, `Glob` only. The skill MUST NOT call `Bash`, `Write`, or `Edit`.

## Rules

The full rule list, including detection patterns, severities, and suggested fixes, lives in the checklist:

- [Pub/sub components checklist](../dapr-shared/review-pubsub-components.md) — `DPS-CFG-001` … `DPS-CFG-014`

Rule ids are stable across releases. New rules append; deprecated rule ids are reserved.

## Show final message

The last thing you emit MUST be the report from step 5, including the `## Next steps` section. The `## Next steps` block should suggest:

- Run `review-pubsub-publishing` next if publisher files exist and it has not yet been run on this scope.
- Run `review-pubsub-subscriptions` next if subscriptions exist.
- Re-run this skill after fixes if any critical findings were reported.

Do not add any text after the report.
