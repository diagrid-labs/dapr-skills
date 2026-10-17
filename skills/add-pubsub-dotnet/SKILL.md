---
name: add-pubsub-dotnet
description: This skill adds Dapr pub/sub to an existing .NET (ASP.NET Core) project, including projects in an Aspire solution. It inspects the project, keeps the subscription type the project already uses (declarative by default, programmatic or streaming), shows a plan for approval, then adds the packages, Dapr wiring, publisher and subscriber code with small targeted edits, building after every step and running the existing tests at the end. Use this skill when the user asks to "add pub/sub to my .NET project", "make this API publish events with Dapr" or "subscribe this ASP.NET app to a topic". For a new project use create-pubsub-dotnet instead.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash(diagrid-dev-dashboard --version)
---

# Add Dapr pub/sub to an existing .NET project

## Overview

This skill adds Dapr pub/sub (publisher, subscriber or both) to an ASP.NET Core project that already exists. It changes nothing before the user approves a written plan, edits existing files with the smallest possible change, follows the project's own conventions and the subscription type it already uses, builds the solution after every step and runs the existing tests at the end. It never changes git state.

## Execution Order

You MUST follow these phases in strict order:
1. **Resolve target** — read-only inspection of the solution, project and existing Dapr wiring.
2. **Check specification** — role, subscription type, topic, message type, features.
3. **Check optional tools** — Diagrid Dapr Dev Dashboard check; never stops the skill.
4. **Plan and approval** — show the Add Pub/Sub Plan with its two questions (package updates, publishing from an existing endpoint) and wait for approval.
5. **Apply** — one step at a time, building after each.
6. **Final verification** — build and test the whole solution.
7. **Write the run doc** — `DAPR-PUBSUB.md` at the solution root (the project folder when there is no solution file).
8. **Show final message** — your output MUST end with EXACTLY the message in `## Show final message` followed by the Dev Dashboard recommendation. No other text after it.

## Prerequisites

The user must have installed:

- .NET SDK 8.0 or later that supports the project's target framework. Check with `dotnet --version`: the SDK major version must be at least the target framework's major version (net8.0 → 8+, net9.0 → 9+, net10.0 → 10+). If a `global.json` pins an SDK, that SDK must be installed.
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) 1.18+ (not needed to build; needed to run)
- Aspire solutions only: the [Aspire CLI](https://aspire.dev/get-started/install-cli/) to start the solution with `aspire run` (not needed to build)
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard). The skill only checks whether it is installed; it never installs it and never stops without it.

## Phase 1: Resolve target

Read-only. Follow **Detection** in `REFERENCE.md`. Determine and remember:

- The solution file (`*.sln` or `*.slnx`) and the target project. If more than one ASP.NET Core project qualifies, ask which one (one question) and wait.
- Target framework. `net8.0`, `net9.0` and `net10.0` are supported. For anything else (`net6.0`, `net7.0`, .NET Framework, or a multi-target list containing one), stop now: say that `Dapr.AspNetCore` 1.18 needs net8.0 or later, suggest upgrading the target framework or creating a separate service with `create-pubsub-dotnet`, and change nothing.
- Host type. Only ASP.NET Core (`Microsoft.NET.Sdk.Web`) is supported. Worker Service, console, Azure Functions, Blazor WebAssembly and MAUI projects stop here with the same kind of explanation.
- Hosting mode: **Aspire** when an AppHost project references the target project; otherwise **dapr run**.
- `Program.cs` (top-level) or `Startup.cs`; minimal APIs or controllers; namespace style, nullable, folder layout.
- Package management: Central Package Management or per-project versions; existing `Dapr.AspNetCore`, `Dapr.Client` and `Dapr.Messaging` packages and versions. Remember every `Dapr.*` package older than 1.18.10 as **newer packages available**.
- Existing wiring: `AddDaprClient(`, `.AddDapr(`, `UseCloudEvents(` (and whether it comes after `UseEndpoints(`), `MapSubscribeHandler(`, `AddDaprMessaging(`, `MapDaprMessaging(`.
- **Existing subscription types** from the marker table in `REFERENCE.md` (`[Topic(`/`.WithTopic(`, `kind: Subscription` YAML, `[DaprTopic(`), and every subscribed `(pubsub, topic)` pair.
- Components: files with `type: pubsub.` (name, type, `scopes`) and `kind: Resiliency` files; `dapr.yaml` and its resources folder.
- Trigger endpoints: existing endpoints that create or accept the thing the event is about (for example `POST /orders`). Read-only endpoints never qualify. Remember the best match, and whether an existing test calls it over HTTP (`WebApplicationFactory`, `HttpClient`).
- Test projects and the build/test commands. Always quote the solution path: `dotnet build "<solution-path>"`, `dotnet test "<solution-path>"`.
- `git status` (read-only). Remember whether the tree has uncommitted changes.

## Phase 2: Check specification

Infer from the request first, then ask, one question at a time:

- **Role:** publisher, subscriber or both (ask only when the request does not say).
- **Subscription type** (when the role includes a subscriber): follow the existing code (Phase 1). With no existing subscriptions use the request ("streaming", "pull", "no inbound port" → streaming; "programmatic", `[Topic]`, `WithTopic` → programmatic; "declarative", "subscription YAML" → declarative); otherwise ask with **declarative** as the default. Mixed types: ask which type the new topic uses, default the type with the most subscriptions.
- **Topic**, **event** and **its fields** — derived from the project's own domain, never from a sample scenario. Reuse an existing domain type as the message type when one fits; otherwise ask which event the app publishes, which fields it carries and which field identifies it (the handler deduplicates on that one). Ask what the subscriber should do with it, and never invent a side effect. These answers resolve the template placeholders; the vocabulary is in [`../dapr-shared/pubsub-placeholders.md`](../dapr-shared/pubsub-placeholders.md).
- Routing, TTL and raw payload only when mentioned. Routing with streaming is unsupported: offer declarative for that subscription (default yes). The dead-letter topic is on by default.
- One type per topic: if the topic is already subscribed through any type, never add a second subscription; ask whether to extend the existing handler or use another topic. Details in `## Clashes and mixed types` in `REFERENCE.md`.

## Phase 3: Check optional tools

Follow the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`) and remember `DevDashboardInstalled`. Do not ask about it, install it or stop because of it.

## Phase 4: Plan and approval

Emit the **Add Pub/Sub Plan** using the template in `REFERENCE.md`. It lists the target, role and subscription type with the reason, the topics, every file to add, every file to edit with a one-line description, package versions and where they go, the Dapr wiring (ports, component reused or new, resiliency, Subscription file), what is left alone, the baseline test run (default yes), and an uncommitted-changes warning when Phase 1 found one.

The plan ends with a **Questions** section. Ask these before any file is created or changed, each with its default:

1. **Package updates** — only when Phase 1 found newer packages available: list each package with its current and new version and ask whether to update them. Default: **Yes, update.** When streaming is chosen and `Dapr.Messaging` is older than 1.18.8, the update to 1.18.10 is a **required** plan item; if the user declines it, switch the plan to declarative and say so.
2. **Publish from the existing endpoint** — only for the publisher or both role when Phase 1 found a trigger endpoint: name it (for example `POST /orders`) and ask whether it should also publish the event after its existing work succeeds. When the request explicitly asks to publish from a named action or endpoint ("when an order is created/placed", "from POST /orders"), the default is **Yes** even when an existing test calls that endpoint over HTTP; the plan then carries a **Risk** line naming the test file(s)/test(s), saying they will need a Dapr sidecar or a test double for the publisher (replace or override the registered `<EventName>Publisher`) and that this skill does not edit tests. When the request does not mention publishing from an existing action, the default is **Yes**, but **No** when an existing test calls that endpoint over HTTP, because the call would then need a running Dapr sidecar; say so in the question. When no endpoint qualifies, write "No existing endpoint publishes the event; use the new `POST /pubsub/<PublishRoute>` endpoint." instead of asking.

Write the plan's file lists as if every default is accepted, and mark which items depend on a question.

Then ask the user to approve, change or stop. A plan is not consent: change nothing until the user says yes. A plain "yes" accepts the plan with the defaults; the user may answer a question differently in the same reply. When the request already says to go ahead without asking, still show the plan with its questions first, then continue with the defaults.

## Phase 5: Apply

If the baseline test run was kept, run `dotnet test "<solution-path>"` once now and remember which tests failed before any change.

Apply the approved items in this fixed order, one step at a time:

1. Packages — `Dapr.AspNetCore` 1.18.10 (publisher, declarative, programmatic) or `Dapr.Messaging` 1.18.10 (streaming; a publisher in the same project then also uses `Dapr.Messaging`, so `Dapr.AspNetCore` is not added), plus the updates from question 1. See **Package reference** in `REFERENCE.md`.
2. Dapr wiring — **dapr run** mode: the `dapr.yaml` entry per [`../dapr-shared/pubsub-dapr-yaml.md`](../dapr-shared/pubsub-dapr-yaml.md) → **Appending to an existing dapr.yaml** (keep the app's existing `appPort` for every subscription type), `pubsub.yaml` from [`../dapr-shared/dapr-pubsub-redis.md`](../dapr-shared/dapr-pubsub-redis.md) or reuse of the existing component, `resiliency.yaml` per [`../dapr-shared/dapr-pubsub-resiliency.md`](../dapr-shared/dapr-pubsub-resiliency.md) (**Appending to an existing Resiliency** when one exists), and `subscription.yaml` per [`../dapr-shared/dapr-pubsub-subscription.md`](../dapr-shared/dapr-pubsub-subscription.md) for declarative; **Aspire** mode: the AppHost edits from **Pub/sub apps** → **Adding to an existing AppHost** in [`../dapr-shared/dotnet-aspire-dapr-wiring.md`](../dapr-shared/dotnet-aspire-dapr-wiring.md).
3. New files — the contract, `PubSubNames` and `<EventName>Publisher` per [`../dapr-shared/dotnet-pubsub-publisher.md`](../dapr-shared/dotnet-pubsub-publisher.md); for a subscriber, the handler per [`../dapr-shared/dotnet-pubsub-handler.md`](../dapr-shared/dotnet-pubsub-handler.md) (declarative, programmatic) or [`../dapr-shared/dotnet-pubsub-messaging.md`](../dapr-shared/dotnet-pubsub-messaging.md) (streaming). Publisher stack: when the chosen type is streaming (`Dapr.Messaging`, no `Dapr.AspNetCore` reference), the publisher role is an `<EventName>Publisher` that injects `IDaprPublishSubscribeClient` and calls `PublishEventAsync` on it, per **Publishing with IDaprPublishSubscribeClient** (the `<EventName>Publisher` block) in the messaging file, NOT the `DaprClient`-based publisher file; it needs `AddDaprMessaging()` only and no `AddDaprClient()`. When the project already references `Dapr.AspNetCore` or `Dapr.Client` (mixed), follow the existing publisher's stack, say which one in the plan, and never register both for the same purpose.
4. Registration — per `## Wiring per subscription type` in `REFERENCE.md`: `AddDaprClient()` only when neither `AddDaprClient(` nor `.AddDapr(` exists; `UseCloudEvents()` before any `Map*` subscriber route (declarative, programmatic), only when missing, and moved when it follows `UseEndpoints(`; `MapSubscribeHandler()` for programmatic only, when missing; `AddDaprMessaging()` for streaming, with `options.DaprGrpcEndpoint` set from `DAPR_GRPC_PORT` as in the shared messaging file (a bare call never opens the stream).
5. Endpoints — the subscriber routes (`/events/pubsub/orders`, `/events/pubsub/orders-deadletter`) per [`../dapr-shared/dotnet-pubsub-subscriber-declarative.md`](../dapr-shared/dotnet-pubsub-subscriber-declarative.md) or [`../dapr-shared/dotnet-pubsub-subscriber-programmatic.md`](../dapr-shared/dotnet-pubsub-subscriber-programmatic.md), in the **Minimal API form** or **Controller form** the project already uses (streaming maps no endpoints). For a publisher: the new `POST /pubsub/orders` endpoint, or, when question 2 was answered yes, the edit to the trigger endpoint per **Adding to an existing Program.cs or Startup.cs** in the publisher file.
6. Requests file — append to an existing `.http` file or add `<ProjectName>.pubsub.http` ([`../dapr-shared/pubsub-local-http.md`](../dapr-shared/pubsub-local-http.md)).

Rules for every step:

- Use `Edit` with the smallest change, and never overwrite an existing file with `Write`. Never touch files the plan does not list.
- Follow the project's style: namespace form, nullable annotations, primary constructors or not, folder names.
- Never add a second pubsub component, `AddDaprClient()`, `MapSubscribeHandler()` or `AddDaprMessaging()`.
- Never subscribe a topic that the app already subscribes through any type.
- Never replace `dapr.yaml` or an existing resiliency file.
- Run no git commands other than `git status`.
- Keep each edited file's existing line endings (CRLF or LF).
- Generated code satisfies the `DPS-*` rules.
- After each step run `dotnet build "<solution-path>"`. If it fails, fix that step or undo that step's edits, tell the user what happened, and stop. Never continue past a failing build.

## Phase 6: Final verification

Run `dotnet build "<solution-path>"` and, when test projects exist, `dotnet test "<solution-path>"`. Report failures that also failed in the baseline run as pre-existing. If the baseline passed and a test that calls the changed endpoint now fails because of the publish call (timeout or connection to the sidecar, e.g. `DaprException`), report it as an expected consequence of the approved Risk line and name the one-line fix (a test double: replace or override the registered `<EventName>Publisher`); failures unrelated to the publish call are regressions. Never edit tests to make them pass. Do not start `dapr run` or `aspire run`.

## Phase 7: Write the run doc

Create `DAPR-PUBSUB.md` at the solution root (or, when Phase 1 found no solution file, in the project folder next to the `.csproj`, which is also where `dapr.yaml` and `resources/` go) from [`../dapr-shared/pubsub-run-doc.md`](../dapr-shared/pubsub-run-doc.md) (follow its **Filling it in** section). Never edit an existing `README.md`.

## Show final message

**IMPORTANT: This is the LAST step. Your output MUST end with the message below followed by the Dev Dashboard recommendation — keep anything before it to one short line (details belong in `DAPR-PUBSUB.md`). Replace `<ProjectName>` with the target project name, and `<root>` with `solution` when a solution file was found or `project` when there is none:**

Dapr pub/sub is added to <ProjectName>. Open DAPR-PUBSUB.md in the <root> root for what changed and how to run it.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled` (in its Aspire form in Aspire mode). Nothing may follow it.
