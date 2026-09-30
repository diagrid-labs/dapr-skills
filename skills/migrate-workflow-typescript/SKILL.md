---
name: migrate-workflow-typescript
description: This skill migrates an existing TypeScript/Node.js application to Dapr incrementally. It scans the existing codebase for service-call, messaging, scheduling, secrets, state, and saga patterns, maps each onto the matching Dapr building block, presents a plan for approval, and applies confirmed changes one at a time with verification between each. Use this skill when the user asks to "migrate this app to Dapr", "add Dapr to my existing Node.js app", "convert this TypeScript service to use Dapr", "help me adopt Dapr incrementally", or similar.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash(git status:*)
  - Bash(git branch:*)
  - Bash(git checkout:*)
  - Bash(git diff:*)
  - Bash(git rev-parse:*)
  - Bash(npm:*)
  - Bash(npx:*)
  - mcp__ide__getDiagnostics
model: opus
---

# Migrate an Existing TypeScript Application to Dapr

## Overview

This skill is different in kind from `create-workflow-typescript`: it does not scaffold a new project — it analyzes an **existing** TypeScript/Node.js application, proposes a mapping of its existing integration points onto Dapr building blocks (service invocation, pub/sub, bindings, jobs, state, secrets, workflow), and applies **only the changes the user confirms**, one at a time, verifying after each. It never rewrites whole files and never assumes a fixed business scenario — the existing code is the spec.

This skill touches code the user did not ask you to create from scratch. Treat every write as something that must be individually justifiable, reversible, and verified — not something to batch through.

## Execution Order

You MUST follow these phases in strict order. Do not skip the safety phase, and do not apply any change before the user has approved the plan.

1. **Resolve scope & detect existing Dapr adoption** — confirm what's being migrated.
2. **Safety setup** — clean working tree, dedicated branch, commit policy.
3. **Discover** — read-only scan for migration candidates across all 7 categories.
4. **Assess & present the plan** — emit the Migration Assessment Report; get explicit approval on scope before touching anything.
5. **Scaffold the Dapr foundation** — add the SDK dependency and only the components needed for approved items.
6. **Apply approved items incrementally** — one integration point at a time, in the fixed safe order below, verifying after each.
7. **Create/update the migration summary** — what changed, what was deferred, how to run it.
8. **Show final message** — your LAST output MUST be EXACTLY the message defined in `## Show final message`. Do NOT add any other text, summary, or commentary after it.

## Prerequisites

The following must be installed by the user before this skill can run:

- [Node.js 22+ (LTS)](https://nodejs.org/en/download)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)
- `git`, with the target repository already checked out

Additional runtime dependency (added during migration, not before): npm package `@dapr/dapr` version `3.18.0`.

## Phase 1: Resolve scope & detect existing Dapr adoption

- If the user named a folder or package in the request, use that as `scope_root`. Otherwise default to the current working directory and confirm it back in one line.
- Confirm `scope_root` contains a Node.js project (`package.json` at or above the scope). If not, stop and tell the user this skill targets Node.js/TypeScript projects.
- Check for existing Dapr adoption: a `dapr.yaml`, a `resources/` (or `components/`) folder with Dapr `Component` YAML, or `@dapr/dapr` already in `package.json`. If found, treat this as **extending** an existing migration, not a fresh one — read what's already there so Phase 5 doesn't duplicate components, and skip straight to Phase 3 for whatever hasn't been migrated yet.
- Detect the web framework in use (Express, Fastify, Koa, NestJS, plain `http`) from `package.json` dependencies — later phases need this to know how routes and middleware are structured.
- Detect the project's own build/typecheck/test commands from `package.json` `scripts` (e.g. `build`, `test`, `lint`). These are what Phase 6 runs after every change — this skill does not invent its own verification command when the project already has one.

## Phase 2: Safety setup

This phase exists because, unlike `create-workflow-typescript`, every subsequent phase edits code the user already depends on.

1. Run `git status`. If the working tree is not clean, stop and ask the user to commit or stash first — never start a migration on top of uncommitted, unrelated changes.
2. Ask the user: create a dedicated branch for this migration (recommended default, e.g. `dapr-migration`), or continue on the current branch? Follow their answer; if they don't have a preference, create the branch.
3. Ask the user's commit policy for this run: (a) leave all changes uncommitted for the user to review and commit themselves (default — matches "never commit without being asked"), or (b) commit after each verified step on the migration branch, so the history shows one commit per building block. **Only commit per-step if the user explicitly chose (b).** Never `git push` regardless of what's chosen here — that always requires a separate, explicit ask.

## Phase 3: Discover

Read-only. Do not write or edit anything in this phase. See `REFERENCE.md` for the full detection heuristics (grep patterns and `package.json` markers) for each of the 7 categories:

- Service invocation candidates — outbound HTTP/gRPC calls to other first-party services.
- Pub/sub candidates — message broker producers and consumers.
- Binding candidates — outbound calls to external (non-first-party) systems, and inbound triggers from them.
- Jobs candidates — cron-style or recurring scheduled work.
- State candidates — simple key-value reads/writes (cache, session, lookup) as distinct from relational/document access that should stay put.
- Secrets candidates — direct environment variable reads and third-party secret-manager SDK calls.
- Workflow candidates — multi-step processes with manual compensation, hand-rolled state machines, or queue-chained pipelines.

Also detect the existing backing infrastructure for each candidate (which Redis/Postgres/Kafka/RabbitMQ/cloud SDK is already in use) — the component YAMLs proposed in Phase 5 must point at what the app already runs against, never default to a fresh Redis the app doesn't use today. See `REFERENCE.md` for the infra-to-component mapping table.

## Phase 4: Assess & present the plan

Emit the Migration Assessment Report using the exact format in [`../shared/migrate-report-format.md`](../shared/migrate-report-format.md). This is the **only** output of this phase — no changes yet.

After the report, ask the user which items to proceed with: all **Recommended** items (default suggestion), a specific subset by rule id, or none yet (stop here). Explicitly confirm before Phase 5 — a report is not consent to modify code.

## Phase 5: Scaffold the Dapr foundation

Only for the categories with at least one approved item, and only for what Phase 1 didn't already find in place:

- Add `@dapr/dapr` (version `3.18.0`) to `package.json` dependencies.
- Create `dapr.yaml` (or add an entry to an existing one) and a `resources/` folder.
- Create one component YAML per approved category, using the infra already detected in Phase 3 — see `REFERENCE.md` for the templates. Do not add components for categories with no approved items.

See `REFERENCE.md` for the full file templates and `dapr run` wiring (`APP_PORT`/`DAPR_HTTP_PORT`/`DAPR_GRPC_PORT`, matching the conventions in `create-workflow-typescript`).

## Phase 6: Apply approved items incrementally

Process approved items in this fixed order — least invasive and easiest to verify first, most invasive last — regardless of the order they appeared in the report:

1. Secrets
2. State
3. Pub/sub
4. Bindings
5. Service invocation
6. Jobs
7. Workflow / saga

For **each individual item** (not each category — one call site at a time):

1. Make the change with `Edit` at the exact detected call site. Do not rewrite the whole file, and do not touch code unrelated to this item.
2. Run the project's own build/typecheck command detected in Phase 1 (and its test command, if one exists).
3. If verification fails, stop, revert or fix that one item, and report the failure — do not proceed to the next item with a known-broken one in place.
4. If the user chose per-step commits in Phase 2, commit now with a message naming the single item migrated.

See `REFERENCE.md` for the verified before/after transformation for each category, and for the service invocation caveat (the full benefit requires the *called* service to also run behind a sidecar — note this in the report rather than silently assuming it).

## Phase 7: Create/update the migration summary

Create or update a `DAPR_MIGRATION.md` file in `scope_root` (do not overwrite an existing project README) with:

1. What was migrated, grouped by building block, each with a before/after file:line reference.
2. What was found but marked **Not recommended** or **Needs manual review**, and why — so the next person doesn't re-litigate it from scratch.
3. The components added and what backing infrastructure they point at.
4. How to run the migrated app locally with the Dapr CLI (`dapr run -f .`), reusing [`../shared/running-locally-dapr.md`](../shared/running-locally-dapr.md).
5. Remaining candidates the user chose not to migrate yet, so a future run of this skill can pick them up.

## Show final message

**IMPORTANT: This is the LAST step. Your final output MUST be ONLY the message below — no preamble, no summary, no additional commentary, only replace the placeholders with actual values:**

Migrated <n> of <total> approved items to Dapr on branch <branch-name>. Open DAPR_MIGRATION.md in <scope_root> for what changed, what was deferred, and how to run it locally.
