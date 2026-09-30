---
name: create-workflow-typescript
description: This skill creates a Dapr application in TypeScript that demonstrates the core Dapr building blocks — Workflow, service invocation, pub/sub, bindings, jobs, state management, and secrets. Use this skill when the user asks to "create a workflow in TypeScript", "create a Dapr app in Node.js", "write a TypeScript Dapr workflow application", "build a Dapr building blocks demo in TypeScript/JavaScript", or similar.
allowed-tools:
  - Bash(npm:*)
  - Bash(npx:*)
  - Bash(dapr:*)
  - mcp__ide__getDiagnostics
---

# Create Dapr Workflow TypeScript Application

## Overview

This skill describes how to create a Dapr application in TypeScript (Node.js) using the [`@dapr/dapr`](https://www.npmjs.com/package/@dapr/dapr) SDK. Unlike the other `create-workflow-*` skills, which scaffold a workflow-only app, this skill scaffolds a Dapr Workflow whose activities each exercise one other core Dapr building block — service invocation, pub/sub, bindings, jobs, state management, and secrets — plus a small second application that the workflow calls into via service invocation.

The `@dapr/dapr` SDK does not yet wrap the Jobs building block (no client method, no server callback hook as of `3.18.0`). The Jobs activity and its trigger route call the Dapr sidecar's HTTP API directly instead of going through the SDK — this is called out explicitly in the generated code, not hidden.

## Execution Order

You MUST follow these phases in strict order:
1. **Check specification** - Check if the user specified what needs to be built.
2. **Project Setup** — Create all files and folders.
3. **Verify** — Verify that the project builds.
4. **Create README.md** — Create a readme that summarizes what is built and how to run & test the application. Do not provide instructions at the end of this phase.
5. **Show final message** - Your LAST output MUST be EXACTLY the message defined in the `## Show final message` section. Do NOT add any other text, summary, or commentary after it.

## Check specification

If you don't have enough context what to build, ask the user the following clarifying questions one by one using an interview style:

1. Use the default **Order Processing** reference scenario, or describe a different business scenario? The default (recommended) prices an order via service invocation, saves it to state, pays for it using a secret, and announces completion via pub/sub, an output binding, and a scheduled follow-up job — exercising all 7 building blocks in one clean flow. If the user describes a different scenario, restate it back mapped onto the same 7 roles (one activity per building block, plus a second small app that the service-invocation activity calls) before proceeding, and adapt file/activity/topic names to that domain instead of the order-processing ones used below.
2. What's the name of this project? This will be used as the folder name. Don't use any spaces in this name.

## Prerequisites

The following must be installed by the user before this skill can run:

- [Node.js 22+ (LTS)](https://nodejs.org/en/download) — the SDK requires Node.js 18+; 22+ is recommended since Node 18 has reached end-of-life.
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)

Additional runtime dependencies (handled during project setup):

- npm package: `@dapr/dapr` version `3.18.0`
- Start the [Diagrid Dev Dashboard](https://www.diagrid.io/blog/improving-the-local-dapr-workflow-experience-diagrid-dashboard): `docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest`

## Project Setup

Create the project root folder inside the current location where the terminal is open:

```shell
mkdir <ProjectRoot>
cd <ProjectRoot>
```

The main application folder should start with the <ProjectRoot> and end with `-app`: <ProjectRoot>-app. The companion service invoked by the service-invocation activity is a second, independent npm project (its name follows the domain — `pricing-service` for the default scenario).

### Folder structure

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── resources/
│   ├── statestore.yaml
│   ├── pubsub.yaml
│   ├── secretstore.yaml
│   ├── binding-receipt.yaml
│   └── binding-schedule.yaml
├── <ProjectName>/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── models.ts
│       ├── workflow.ts
│       └── activities.ts
└── pricing-service/
    ├── package.json
    ├── tsconfig.json
    └── src/
        └── index.ts
```

### .gitignore

Node.js style `.gitignore` file in the project root. See `REFERENCE.md` for full example.

### dapr.yaml

Multi-app run file in the project root that starts both the main app and the companion service together, each with its own Dapr sidecar. Points to the resources folder. See `REFERENCE.md` for full example and key points.

### resources/statestore.yaml

Dapr Workflow requires a state store component (with `actorStateStore` set to `"true"`). See [`../shared/dapr-statestore.md`](../shared/dapr-statestore.md) for full example and key points.

### resources/pubsub.yaml

See [`../shared/dapr-pubsub-redis.md`](../shared/dapr-pubsub-redis.md) for full example and key points.

### resources/secretstore.yaml

See [`../shared/dapr-secretstore-local-env.md`](../shared/dapr-secretstore-local-env.md) for full example and key points.

### resources/binding-receipt.yaml and resources/binding-schedule.yaml

An output binding (`bindings.http`) and an input binding (`bindings.cron`) — the two directions of the Bindings building block. Neither needs extra infrastructure beyond what `dapr init` already provides. See `REFERENCE.md` for full example and key points.

### package.json / tsconfig.json (both apps)

Standard npm project files. Targets the `@dapr/dapr` SDK with CommonJS modules, matching the SDK's own tested consumption pattern. See `REFERENCE.md` for full example.

### Models

TypeScript interfaces for workflow and activity input/output, placed in a `models.ts` file in the main app. See `REFERENCE.md` for full example and key points.

### Workflow file

A workflow is an `async function*` registered with `WorkflowRuntime.registerWorkflow(...)`. The workflow code is placed in a `workflow.ts` file and orchestrates activities via `ctx.callActivity(...)`. See `REFERENCE.md` for full example, key points, determinism rules, and workflow patterns (chaining, fan-out/fan-in, sub-workflows, external events, saga).

### Activities file

Activities are plain (usually `async`) functions registered with `WorkflowRuntime.registerActivity(...)`, placed in an `activities.ts` file. Each activity in the default scenario demonstrates one building block: service invocation, state, secrets, pub/sub, bindings, and jobs. See `REFERENCE.md` for full example and key points.

### Main entrypoint (src/index.ts)

Constructs a plain Express app, hands it to `new DaprServer({ serverHttp: app })` so Dapr-routed calls (service invocation, pub/sub, input bindings) and the app's own routes (workflow management, the Jobs trigger callback) share one HTTP port; also constructs the `WorkflowRuntime` and `DaprWorkflowClient` (these use their own gRPC connection to the sidecar, independent of `DaprServer`). Registers the workflow, activities, pub/sub subscription, input binding, and the management endpoints (`/start`, `/status/:instanceId`, `/pause/:instanceId`, `/resume/:instanceId`, `/terminate/:instanceId`, `/purge/:instanceId`). See `REFERENCE.md` for full example and key points.

### pricing-service/src/index.ts

A minimal second Dapr app exposing one invocable method (`calculate-total`) via `server.invoker.listen(...)`, called by the main app's service-invocation activity. See `REFERENCE.md` for full example.

### local.http

See [`../shared/typescript-local-http.md`](../shared/typescript-local-http.md) for the full example and key points.

## Verify

**IMPORTANT: After Project Setup you MUST run these exact verification instructions:**

1. Run `npm install` in the `<ProjectName>` folder to install dependencies.
2. Run `npm install` in the `pricing-service` folder to install dependencies.
3. Run `npx tsc --noEmit` in both folders to check for type errors.

## Create README.md

**IMPORTANT: After Verify you MUST run these instructions:**

Create a README.md file inside the <ProjectRoot> folder.

The README contains the following sections:
1. Summary of what this folder contains, explicitly listing which building block each activity/route demonstrates.
2. Architecture description that explains the technology stack (Node.js, TypeScript, `@dapr/dapr`, Express) and prerequisites to run it locally. **DO NOT suggest to run Redis separately since it's part of the Dapr installation and is running in a container already.** Note that the Jobs activity and its callback route bypass the SDK and call the Dapr sidecar's HTTP API directly, since `@dapr/dapr` does not yet wrap Jobs.
3. A mermaid diagram that explains the workflow, including the call out to the companion service.
4. How to start the application using the Dapr CLI (`dapr run -f .` starts both apps and their sidecars).
5. List the available endpoints in the main app's `src/index.ts` file and provide examples of how to call these using curl. Also include a link to the `local.http` file.
6. How to inspect the workflow execution using the Diagrid Dev Dashboard.
7. How to run the application with Diagrid Catalyst to visually inspect the workflow.

See `REFERENCE.md` for additional instructions on running locally and running with Catalyst.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> workflow application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.
