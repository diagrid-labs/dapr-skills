---
name: add-pubsub-python
description: This skill adds Dapr pub/sub to an existing Python FastAPI app. It inspects the app, keeps the subscription type it already uses (declarative by default, programmatic with dapr-ext-fastapi, or streaming), shows a plan for approval, then adds the dependencies, Dapr wiring, publisher and subscriber code with small targeted edits, checking imports after every step and running the existing tests at the end. Use this skill when the user asks to "add pub/sub to my FastAPI app" or "make this Python service subscribe to a Dapr topic". For a new app use create-pubsub-python instead.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash(uv:*)
  - Bash(python:*)
  - Bash(python3:*)
  - Bash(py:*)
  - Bash(pip:*)
  - Bash(dapr:*)
  - Bash(git status:*)
  - Bash(diagrid-dev-dashboard --version)
  - mcp__ide__getDiagnostics
---

# Add Dapr pub/sub to an existing Python FastAPI app

## Overview

This skill adds Dapr pub/sub (publisher, subscriber or both) to a FastAPI app that already exists. It changes nothing before the user approves a written plan, edits existing files with the smallest possible change, follows the project's own conventions, checks that the code still compiles and imports after every step and runs the existing tests at the end. It never changes git state.

## Execution Order

You MUST follow these phases in strict order:
1. **Resolve target** — read-only inspection of the project.
2. **Check specification** — role, subscription type, topic, message type, optional features.
3. **Check optional tools** — Diagrid Dapr Dev Dashboard check; never stops the skill.
4. **Plan and approval** — show the Add Pub/Sub Plan with its two questions (package updates, publishing from an existing endpoint) and wait for approval.
5. **Apply** — one step at a time, checking after each.
6. **Final verification** — compile, import and test.
7. **Write the run doc** — `DAPR-PUBSUB.md` at the project root.
8. **Show final message** — your output MUST end with EXACTLY the message in `## Show final message` followed by the Dev Dashboard recommendation. No other text after it.

## Prerequisites

The user must have installed:

- Python 3.10 or later (the project's own interpreter) and the package manager the project uses: [uv](https://docs.astral.sh/uv/getting-started/installation/), or pip with a `requirements.txt` or a `pyproject.toml`.
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) 1.18+ (not needed to check the code; needed to run)
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard). The skill only checks whether it is installed; it never installs it and never stops without it.

## Phase 1: Resolve target

Read-only. Follow **Detection** in `REFERENCE.md`. Determine and remember:

- The scope folder and the FastAPI app module (the file containing `FastAPI(`). If more than one qualifies, ask which (one question) and wait.
- Python version (`requires-python`, `.python-version`, `python --version`). Below 3.10, stop now and explain; change nothing.
- Framework. Only FastAPI is supported. For a Flask, Django or other app, stop and explain; point to `## Alternative: dapr-ext-grpc` in [`../dapr-shared/python-pubsub-subscriber-programmatic.md`](../dapr-shared/python-pubsub-subscriber-programmatic.md) and change nothing.
- Package manager. uv → `uv add`. pip with `requirements.txt` → `Edit` plus `python -m pip install -r requirements.txt` in the project venv (ask when no venv exists). pip with a `pyproject.toml` `[project].dependencies` → `Edit` plus `python -m pip install -e .`. **Poetry, PDM, Pipenv and conda** (`poetry.lock`, `[tool.poetry]`, `pdm.lock`, `Pipfile`, `environment.yml`): stop and explain that v1 does not support them; change nothing.
- Interpreter for checks: `uv run` with uv, otherwise `.venv/Scripts/python.exe` (Windows) or `.venv/bin/python`. Written as `<python>` below.
- Existing packages: `dapr`, `dapr-ext-fastapi`, `dapr-ext-grpc`, `dapr-ext-workflow` and their pins. Any `dapr*` pin below 1.18.3 is a **newer package available**.
- Existing subscriptions, as `(pubsub, topic)` pairs and types: `DaprApp(` with `.subscribe(` (programmatic), `subscribe_with_handler(` or `client.subscribe(` (streaming), `kind: Subscription` YAML (declarative). Also an existing `DaprApp`, an existing `lifespan`, existing `publish_event(` calls.
- Existing Dapr files: `dapr.yaml`, its resources folder, every `type: pubsub.` component, `kind: Resiliency` files.
- Trigger endpoints: existing endpoints that create or accept the thing being published (for example `POST /orders`); read-only `GET` endpoints never qualify. Remember whether an existing test calls it over HTTP (`TestClient`, `httpx`).
- Tests (`pytest`) and `git status` (read-only). Remember uncommitted changes.

## Phase 2: Check specification

Infer from the request first; otherwise ask, one question at a time:

1. **Role** — publisher, subscriber or both.
2. **Subscription type** (subscriber roles only) — follow the type the code already uses; else the prompt ("streaming", "programmatic", `DaprApp`, "declarative"); else ask, default **declarative**. One type per topic; mixed types are allowed, so ask which one the new topic uses. Never subscribe a `(pubsub, topic)` pair that exists; ask whether to extend the existing handler or use another topic.
3. **Topic**, **event** and **its fields** — derived from the project's own domain, never from a sample scenario. Reuse an existing domain model as the message type when one fits; otherwise ask which event the app publishes, which fields it carries and which field identifies it (the handler deduplicates on that one). Ask what the subscriber should do with it, and never invent a side effect.
   These answers resolve the template placeholders; the vocabulary is in [`../dapr-shared/pubsub-placeholders.md`](../dapr-shared/pubsub-placeholders.md).
4. Routing, TTL and raw payload only when mentioned. Routing with programmatic or streaming is unsupported in Python: offer declarative for that subscription (default yes).
5. Dead-letter topic is on unless declined.

## Phase 3: Check optional tools

Follow the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`) and remember `DevDashboardInstalled`. Do not ask about it, install it or stop because of it.

## Phase 4: Plan and approval

Emit the **Add Pub/Sub Plan** using the template in `REFERENCE.md`: target, role, subscription type with the reason, packages, new and edited files, Dapr wiring, topics and routes, what is left unchanged, the baseline test run (default yes) and an uncommitted-changes warning when Phase 1 found one. End it with the **Questions**, each with its default:

1. **Package updates** — only when Phase 1 found newer packages: list each with its current and new version and ask whether to update. Default: **Yes, update.**
2. **Publish from the existing endpoint** — only for publisher or both roles and when a trigger endpoint exists: ask whether it should also publish after its existing work succeeds. When the request explicitly asks to publish from a named action or endpoint ("when an order is created/placed", "from POST /orders"), the default is **Yes** even when an existing test calls it over HTTP; the plan then carries a **Risk** line naming the test file(s)/test(s), saying they will need a Dapr sidecar or a test double for the publisher via `app.dependency_overrides[get_<event_name>_publisher]` (the exact override target; the skill injects the publisher into the endpoint with `Depends(get_<event_name>_publisher)`), that without a sidecar each publishing call waits for the health check, so run them with `DAPR_HEALTH_TIMEOUT=2` (seconds; POSIX `DAPR_HEALTH_TIMEOUT=2 uv run pytest`, PowerShell `$env:DAPR_HEALTH_TIMEOUT=2` first) for a quick failure, and that this skill does not edit tests. When the request does not mention publishing from an existing action, the default is **Yes**, but **No** when an existing test calls it over HTTP (it would need a running sidecar); say so. Without a trigger endpoint, write "No existing endpoint publishes; use the new publish endpoint."

Write the file lists as if every default is accepted. Then ask the user to approve, change or stop. A plan is not consent: change nothing until the user says yes. When the request says to go ahead without asking, still show the plan first, then continue with the defaults.

## Phase 5: Apply

If the baseline test run was kept, run the tests once now (`uv run pytest` or `<python> -m pytest`) and remember which failed. Then apply, one step at a time:

1. Packages — `dapr` and, for programmatic, `dapr-ext-fastapi` at 1.18.3 (or the existing `dapr==1.18.x` pin) per **Dependencies per subscription type** in `REFERENCE.md`; plus the updates from question 1.
2. Dapr wiring — `dapr.yaml` entry or append ([`../dapr-shared/pubsub-dapr-yaml.md`](../dapr-shared/pubsub-dapr-yaml.md)), `pubsub.yaml` ([`../dapr-shared/dapr-pubsub-redis.md`](../dapr-shared/dapr-pubsub-redis.md)) or reuse of the existing component, `resiliency.yaml` ([`../dapr-shared/dapr-pubsub-resiliency.md`](../dapr-shared/dapr-pubsub-resiliency.md)), and for declarative `subscription.yaml` ([`../dapr-shared/dapr-pubsub-subscription.md`](../dapr-shared/dapr-pubsub-subscription.md)) with `scopes` equal to the app id.
3. New files — contract and constants ([`../dapr-shared/python-pubsub-publisher.md`](../dapr-shared/python-pubsub-publisher.md) → **Contracts**), `handler.py` ([`../dapr-shared/python-pubsub-handler.md`](../dapr-shared/python-pubsub-handler.md)).
4. Registration — programmatic: one `DaprApp(app)`, reusing an existing one. Streaming: start and close in the `lifespan`, merging into an existing one, never replacing it ([`../dapr-shared/python-pubsub-subscriber-streaming.md`](../dapr-shared/python-pubsub-subscriber-streaming.md) → **Inside an existing FastAPI app (add)**).
5. Endpoints — subscriber routes per the file for the chosen type: [declarative](../dapr-shared/python-pubsub-subscriber-declarative.md) or [programmatic](../dapr-shared/python-pubsub-subscriber-programmatic.md), under `/events/<pubsub>/<topic>`; the publish endpoint `POST /pubsub/<publish_route>` per **Adding to an existing FastAPI app** in [`../dapr-shared/python-pubsub-publisher.md`](../dapr-shared/python-pubsub-publisher.md), or the trigger endpoint edit when question 2 was yes: inject the publisher with `publisher: Callable[[<EventName>], None] = Depends(get_<event_name>_publisher)` exactly as shown in that file (never call a module-level publish function directly, `dependency_overrides` could not replace it). The new publish code that catches `DaprGrpcError` must also catch `TimeoutError` (see **Edge cases** in `REFERENCE.md`).
6. Requests file — append to an existing `.http` file or add `<ProjectName>.pubsub.http` ([`../dapr-shared/pubsub-local-http.md`](../dapr-shared/pubsub-local-http.md)).

Rules for every step:

- Edit existing files with `Edit` and the smallest change; never rewrite an existing file with `Write` or a shell heredoc, because a wholesale rewrite drops the user's formatting and comments and makes the plan's edited-files list untrustworthy. When a shell is awkward, use `Edit` once per hunk; if `Edit` is unavailable, use a script that inserts or replaces ONLY the planned lines, then verify the diff shows no other changed lines. Never change files the plan does not list.
- Follow the project's style (imports, type hints, module layout). Never add a second pubsub component, `DaprApp` or `lifespan`; never replace `dapr.yaml` or an existing resiliency file (append); keep an existing `appPort`.
- A declarative `scopes` entry must equal the `appID`. Use `rawPayload` (never `isRawPayload`) as the raw payload metadata key.
- After each step run `<python> -m compileall -q <changed files>`, and after steps 3–5 also `<python> -c "import <app module>"`. If it fails, fix that step or undo its edits, tell the user and stop. Never continue past a failing check.
- Never run `git` commands other than `git status`.

## Phase 6: Final verification

Run the compile and import checks once more and, when tests exist, `uv run pytest` or `<python> -m pytest`. With an edited trigger endpoint and no sidecar, run the test command with `DAPR_HEALTH_TIMEOUT=2` set for that command only (POSIX `DAPR_HEALTH_TIMEOUT=2 uv run pytest`; PowerShell `$env:DAPR_HEALTH_TIMEOUT=2; uv run pytest`) so the expected failure takes seconds instead of the default 60 s per call. Report failures that also failed in the baseline as pre-existing. If the baseline passed and a test that calls the changed endpoint now fails because of the publish call (timeout or connection to the sidecar, e.g. `publish_event` `TimeoutError`), report it as an expected consequence of the approved Risk line and name the one-line fix (`app.dependency_overrides[get_<event_name>_publisher] = ...`); failures unrelated to the publish call are regressions. Never edit tests to make them pass. Do not start `dapr run`.

## Phase 7: Write the run doc

Create `DAPR-PUBSUB.md` at the project root using the template in [`../dapr-shared/pubsub-run-doc.md`](../dapr-shared/pubsub-run-doc.md) (see **Add Pub/Sub run doc** notes in `REFERENCE.md`). In its Tests section, say that tests calling the publishing endpoint need `app.dependency_overrides[get_<event_name>_publisher]` or a sidecar, and to set `DAPR_HEALTH_TIMEOUT=2` when running them without one. Never edit an existing `README.md`.

## Show final message

**IMPORTANT: This is the LAST step. Your output MUST end with the message below followed by the Dev Dashboard recommendation — keep anything before it to one short line (details belong in `DAPR-PUBSUB.md`). Replace `<ProjectName>` with the target project name:**

Dapr pub/sub is added to <ProjectName>. Open DAPR-PUBSUB.md in the project root for what changed and how to run it.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled`. Nothing may follow it.
