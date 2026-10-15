---
name: create-pubsub-dotnet
description: This skill creates a Dapr pub/sub application in .NET — a publisher, a subscriber or both — with declarative (default), programmatic or streaming subscriptions, run with the Dapr CLI or .NET Aspire, using minimal APIs or controllers. Use this skill when the user asks to "create a pub/sub app in .NET", "build a Dapr publisher and subscriber in C#", "create a pub/sub app with Aspire" or "create a .NET streaming subscriber". For an existing project use add-pubsub-dotnet instead.
allowed-tools:
  - Bash(dotnet:*)
  - Bash(dapr:*)
  - Bash(aspire new:*)
  - Bash(~/.aspire/bin/aspire new:*)
  - Bash(diagrid-dev-dashboard --version)
  - mcp__ide__getDiagnostics
---

# Create Dapr Pub/Sub .NET Application

## Overview

This skill creates a new Dapr pub/sub application in .NET: a publisher, a subscriber or both, sharing the message contract the user described and one Redis-backed `pubsub` component. The subscriber uses a declarative (default), programmatic or streaming subscription, and the app runs with `dapr run -f .` or with .NET Aspire.

The application is built from the user's own domain. There is no built-in sample scenario: the event, its fields, its topic and what the subscriber does with it all come from the **Check specification** interview, and every template is filled in from the placeholder vocabulary in [`../dapr-shared/pubsub-placeholders.md`](../dapr-shared/pubsub-placeholders.md).

## Execution Order

You MUST follow these phases in strict order:
1. **Check specification** - Check if the user specified what needs to be built; infer first, then ask.
2. **Check optional tools** — Check whether the Diagrid Dapr Dev Dashboard is installed and remember the result. Never stop, ask or install for this.
3. **Project Setup** — Create all files and folders.
4. **Verify** — Verify that the solution builds.
5. **Create README.md** — Create a readme that summarizes what is built and how to run & test the application. Do not provide instructions at the end of this phase.
6. **Show final message** - Your LAST output MUST be EXACTLY the message defined in the `## Show final message` section: the closing sentence followed by the Dev Dashboard recommendation. Do NOT add any other text, summary, or commentary.

## Prerequisites

The following must be installed by the user before this skill can run. Do not run the check-prereq skills; assume the prerequisites are installed.

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) 1.18+ (`dapr init` provides Redis)
- [Aspire CLI](https://aspire.dev/get-started/install-cli/), only for Aspire mode

Packages (added during project setup):

- `Dapr.AspNetCore` `1.18.10` for the publisher, declarative subscribers and programmatic subscribers
- `Dapr.Messaging` `1.18.10` for streaming subscribers (no `Dapr.AspNetCore` in that project)
- Aspire mode only: `CommunityToolkit.Aspire.Hosting.Dapr` `13.0.0` and `Aspire.Hosting.Valkey` (same version as the `Aspire.AppHost.Sdk` that `aspire new` writes)
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard). The skill only checks whether it is installed; it never installs it and never stops without it.

Concepts (CloudEvents, dead-letter, routing, TTL, raw payload, subscription types): [`../dapr-shared/pubsub-concepts.md`](../dapr-shared/pubsub-concepts.md).
Placeholder vocabulary used by every template: [`../dapr-shared/pubsub-placeholders.md`](../dapr-shared/pubsub-placeholders.md).

## Check specification

**Never build a default scenario.** The application is about the user's domain, and the templates are
placeholders waiting for it. Infer everything the prompt already says, then ask only what is missing, one
question at a time, waiting for each answer. If the prompt gives no domain at all, ask for it — do not
invent one and do not fall back to an order-processing example.

Domain, first:

1. "What is the purpose of this pub/sub application?"
2. "Which event does it publish, and on which topic?" Accept several if the user describes several; one is
   the normal case. The topic name is lowercase and hyphenated; the event type is PascalCase.
3. For each event: "Which fields does the message carry, and which one uniquely identifies it?" The
   identifying field becomes `<IdProperty>`: the handler deduplicates on it, so there must be exactly one
   per event. Ask for the type of each field when the name does not make it obvious.
4. "What should the subscriber do when it receives this event?" If the user wants nothing beyond receiving
   it, say that the handler will log it and move on; never invent a side effect.

Then the wiring:

5. "Should this app publish, subscribe, or both? (default: both)"
6. Only if the role includes a subscriber: "Which subscription type? **declarative** (default — a Subscription YAML file, no Dapr code in the subscriber), **programmatic** (`[Topic]`/`WithTopic` in code) or **streaming** (the app pulls messages; no inbound port)". Inference: "streaming", "no inbound port" or "pull" → streaming; "programmatic", `[Topic]` or `WithTopic` → programmatic; "declarative" or "subscription YAML" → declarative.
7. "Run it with the Dapr CLI (`dapr run`, default) or with .NET Aspire?"
8. "Minimal APIs (default) or controllers?" **Skip** this when the subscriber is streaming and the role is `subscriber`.
9. "What's the name of this project? It is used as the folder and solution name. Don't use any spaces."

Feature rules:

- The dead-letter topic (`<TopicName>-deadletter`) is on unless the user declines it.
- Routing (CEL), message TTL and raw payload are added only when the user mentions them. See `REFERENCE.md` → **Routing, TTL and raw payload**.
- If the user asks for a broker other than Redis (for example Kafka), still scaffold Redis locally and say so in the README; the README explains how to switch.
- Routing combined with streaming is unsupported. Ask: "Streaming subscriptions cannot route by content. Use a declarative subscription for this topic instead? (default: yes)". On yes, switch the type to declarative.

### Resolving the placeholders

Before creating any file, write out the resolved values and restate them to the user in two or three
lines, so a wrong reading is caught before it is scaffolded. Resolve them exactly as
[`../dapr-shared/pubsub-placeholders.md`](../dapr-shared/pubsub-placeholders.md) defines them:

| Placeholder | Resolved from |
|---|---|
| `<EventName>`, `<EventFields>`, `<IdProperty>` | questions 2 and 3 |
| `<eventVar>`, `<EventDescription>` | `<EventName>`, in camelCase and as a lowercase noun phrase |
| `<TopicName>`, `<DeadLetterTopicName>` | question 2; the dead-letter topic is `<TopicName>-deadletter` |
| `<TopicConstant>`, `<DeadLetterTopicConstant>`, `<TopicResource>` | PascalCase of `<TopicName>` |
| `<PublishRoute>`, `<PublishResource>`, `<SubscribeRoute>`, `<DeadLetterRoute>` | `<TopicName>`; the subscribe route is `/events/pubsub/<TopicName>` |
| `<ValidationCondition>`, `<HandlerBody>` | questions 3 and 4 |

Fixed, never derived from the domain: the component name `pubsub`, the class `PubSubNames`, the
idempotency store `IProcessedEvents` / `InMemoryProcessedEvents`, and `PublishFeatures`. `<root-kebab>` is
`<ProjectRoot>` in kebab-case (`ShipTrack` → `shiptrack`); app ids are `<root-kebab>-publisher` and
`<root-kebab>-subscriber`.

## Check optional tools

Check once whether the optional Dev Dashboard is installed by following the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`). Remember the result (`DevDashboardInstalled`) for the final message. This check never stops the skill: do not ask the user about it, do not install anything, and continue whether or not the dashboard is installed.

## Project Setup

Create the project root inside the current location where the terminal is open. Run all commands from inside `<ProjectRoot>` and do not `cd` elsewhere between commands.

### Dapr CLI mode (`dapr run`)

```shell
mkdir <ProjectRoot>
cd <ProjectRoot>
dotnet new sln --format slnx -n <ProjectRoot>
dotnet new web -n <ProjectRoot>.Publisher
dotnet new web -n <ProjectRoot>.Subscriber
dotnet new classlib -n <ProjectRoot>.Contracts
dotnet add <ProjectRoot>.Publisher package Dapr.AspNetCore --version 1.18.10
dotnet add <ProjectRoot>.Subscriber package Dapr.AspNetCore --version 1.18.10
dotnet add <ProjectRoot>.Publisher reference <ProjectRoot>.Contracts
dotnet add <ProjectRoot>.Subscriber reference <ProjectRoot>.Contracts
dotnet sln add <ProjectRoot>.Publisher <ProjectRoot>.Subscriber <ProjectRoot>.Contracts
```

- Role `publisher` or `subscriber`: create only that web project; no `classlib`; the contract goes in the project's `Models/` folder.
- Streaming subscriber: add `Dapr.Messaging` `1.18.10` to the subscriber instead of `Dapr.AspNetCore`.
- Set `<TargetFramework>net10.0</TargetFramework>` in every project.
- Delete the generated `Class1.cs` from the Contracts classlib.

### Aspire mode

**IMPORTANT: Always include `--non-interactive`, `--test-framework none` and `--suppress-agent-init`.** Without `--suppress-agent-init` the Aspire CLI changes the user's global AI tool configuration.

```shell
aspire new aspire-starter -n <ProjectRoot> -o <ProjectRoot> --non-interactive --test-framework none --suppress-agent-init
```

Then, from inside `<ProjectRoot>`:

1. Delete the generated `<ProjectRoot>.Web` and `<ProjectRoot>.ApiService` projects and remove them from the solution file (`<ProjectRoot>.sln`) and remove their two `<ProjectReference>` lines from `<ProjectRoot>.AppHost.csproj`.
2. Create `<ProjectRoot>.Publisher` and `<ProjectRoot>.Subscriber` (`dotnet new web`) and the Contracts classlib (role `both`), add them to the solution, reference ServiceDefaults from each web project, and call `builder.AddServiceDefaults();` and `app.MapDefaultEndpoints();` in their `Program.cs`.
3. Add the Dapr packages from the Prerequisites list (read the `Aspire.AppHost.Sdk` version from the AppHost `.csproj`; keep the versions `aspire new` wrote).
4. Add the `<Content Include="Resources\**\*.*">` item group (with `CopyToOutputDirectory` and `Link`) to the AppHost `.csproj` as in the wiring file's **AppHost .csproj** section, then wire the AppHost, `Resources/` folder and Dev Dashboard resource per [`../dapr-shared/dotnet-aspire-dapr-wiring.md`](../dapr-shared/dotnet-aspire-dapr-wiring.md) → **Pub/sub apps**. No `dapr.yaml` is created.

### Folder structure

See `REFERENCE.md` → **Folder structures** for the four trees (dapr run both / single role, Aspire both, streaming subscriber).

### Files

Each file below comes from a shared file. Copy it and replace every placeholder with the value resolved in
**Resolving the placeholders**. A file is never written with a placeholder left in it: after writing each
one, check it for a stray `<` ... `>` that is not valid C# generics or XML.

**Namespaces.** `<ProjectNamespace>` is `<ProjectRoot>.<Role>` for a web project (`ShipTrack.Publisher`, `ShipTrack.Subscriber`) and `<ProjectRoot>.Contracts` for the classlib. Single role: the contract files keep the project namespace (they live in `Models/` but declare `namespace <ProjectNamespace>;`). Wire them up with global usings in each web project's `.csproj`, not per-file `using` lines (this works for minimal APIs, controllers and Aspire):

```xml
<ItemGroup>
  <Using Include="<ProjectRoot>.Contracts" />   <!-- role both only -->
  <Using Include="<ProjectRoot>.<Role>" />
</ItemGroup>
```

- **`dapr.yaml`** (dapr run mode) — [`../dapr-shared/pubsub-dapr-yaml.md`](../dapr-shared/pubsub-dapr-yaml.md) (.NET values: publisher 5110/3510/50010, subscriber 5120/3520/50020). Omit `appPort` for a streaming-only subscriber.
- **`resources/pubsub.yaml`** — [`../dapr-shared/dapr-pubsub-redis.md`](../dapr-shared/dapr-pubsub-redis.md) (Aspire: use the version in the wiring file, which has a different host and password).
- **`resources/resiliency.yaml`** — [`../dapr-shared/dapr-pubsub-resiliency.md`](../dapr-shared/dapr-pubsub-resiliency.md) (dead-letter on).
- **`resources/subscription.yaml`** (declarative only) — [`../dapr-shared/dapr-pubsub-subscription.md`](../dapr-shared/dapr-pubsub-subscription.md). The `scopes` value MUST be the subscriber app id (`<root-kebab>-subscriber`), identical to the `appID` in `dapr.yaml` or `DaprSidecarOptions.AppId` in the AppHost.
- **Contracts** (`<EventName>`, `PubSubNames`) — [`../dapr-shared/dotnet-pubsub-publisher.md`](../dapr-shared/dotnet-pubsub-publisher.md) → **Message contract**.
- **Publisher** (`<EventName>Publisher`, `POST /<PublishRoute>`, minimal API or controller, registration) — [`../dapr-shared/dotnet-pubsub-publisher.md`](../dapr-shared/dotnet-pubsub-publisher.md).
- **Subscriber**, by type:
  - declarative — [`../dapr-shared/dotnet-pubsub-subscriber-declarative.md`](../dapr-shared/dotnet-pubsub-subscriber-declarative.md). `app.UseCloudEvents()` MUST come before the endpoint mappings; otherwise the typed body binds the CloudEvent envelope and every field is null.
  - programmatic — [`../dapr-shared/dotnet-pubsub-subscriber-programmatic.md`](../dapr-shared/dotnet-pubsub-subscriber-programmatic.md) (also `UseCloudEvents()` first).
  - streaming — [`../dapr-shared/dotnet-pubsub-messaging.md`](../dapr-shared/dotnet-pubsub-messaging.md) → **Streaming subscriber**.
- **Handler** (`<EventName>Handler`, dead-letter handler) — [`../dapr-shared/dotnet-pubsub-handler.md`](../dapr-shared/dotnet-pubsub-handler.md).
- **`pubsub.http`** — [`../dapr-shared/pubsub-local-http.md`](../dapr-shared/pubsub-local-http.md), using the `launchSettings.json` ports.
- **`.gitignore`** — [`../dapr-shared/dotnet-gitignore.md`](../dapr-shared/dotnet-gitignore.md).
- **`Properties/launchSettings.json`** — `dotnet new web` generates this file with random ports and an https profile; replace its profiles with a single `http` profile (omit `launchUrl`) with `applicationUrl` `http://localhost:5110` (publisher) and `http://localhost:5120` (subscriber). The port MUST equal `appPort` in `dapr.yaml`; a streaming-only subscriber has no `appPort`, so its port is only used by `dotnet run`.

For the `Program.cs` of each type and style, see `REFERENCE.md` → **Program.cs per type and style**.

## Verify

**IMPORTANT: After Project Setup you MUST run these checks:**

1. Run `dotnet build "<ProjectRoot>.slnx"` (`dotnet new sln --format slnx` writes `.slnx`). Aspire mode: `dotnet build "<ProjectRoot>.sln"`, because `aspire new` writes a `.sln`. It must succeed; fix any errors and rebuild.
2. When `mcp__ide__getDiagnostics` is available, check the new files with it as well.
3. Tell the user how to start the apps: `dapr run -f .` in `<ProjectRoot>` (Aspire: `aspire run`).

## Create README.md

**IMPORTANT: After Verify you MUST run these instructions:**

Create a README.md inside `<ProjectRoot>` with these sections:

1. Summary of what this folder contains.
2. Architecture: what the application does in the user's own domain terms, the roles, the subscription type and why, the technology stack and prerequisites, and a mermaid sequence diagram showing who opens the connection (sidecar pushes to the app for declarative and programmatic; the app pulls over a stream for streaming). **DO NOT suggest running Redis separately; `dapr init` provides it (Aspire: the Valkey container).**
3. Run and try it: the start command, curl examples for the endpoints in the publisher `Program.cs`, and a link to `pubsub.http`.
4. How to see the subscriptions: `GET /v1.0/metadata` on the sidecar and the Dev Dashboard's subscriptions view.
5. Declarative only: the subscription file hot-reloads, so editing `subscription.yaml` needs no restart.
6. Local-only notes (see `REFERENCE.md` → **README key points**).
7. The **Diagrid Dapr Dev Dashboard** section from the **README section** of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (Aspire form in Aspire mode).
8. **Switching the message broker**: one short paragraph (see `REFERENCE.md` → **README key points**).
9. Dapr CLI mode only: running with Catalyst, from [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md).
10. Next steps: run the `review-pubsub-publishing`, `review-pubsub-subscriptions` and `review-pubsub-components` skills.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below followed by the Dev Dashboard recommendation — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> pub/sub application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled` (use the Aspire form in Aspire mode). Use it as written. Nothing may follow it.
