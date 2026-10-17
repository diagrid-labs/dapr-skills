---
name: create-agent-dotnet
description: This skill creates a durable AI agent application in .NET, running locally with the Dapr CLI (`dapr run`), using Microsoft Agent Framework on Dapr Workflow. Use this skill when the user asks to "create an agent in .NET", "build an agent app in C#", or "scaffold a .NET agent with Microsoft Agent Framework". For a Durable Agent that runs on Diagrid Catalyst, use the catalyst-ai plugin instead.
allowed-tools:
  - Write
  - Edit
  - Bash(diagrid-dev-dashboard --version)
---

# Create a .NET Agent Application

## Overview

This skill describes how to create a durable AI agent application in .NET.

> **On naming.** [Dapr Agents](https://github.com/dapr/dapr-agents) is a **Python-only** framework and is not used here. The .NET path is [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/) (`Microsoft.Agents.AI` + `Microsoft.Extensions.AI`) executed durably on Dapr Workflow by the [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework) package. That package turns every LLM call and every tool call into its own workflow activity, so an agent run survives a process restart and resumes from the last completed step. The `Dapr` in `AddDaprAgents()` / `IDaprAgentInvoker` names that workflow runtime — it is not the Python framework.

The LLM is reached through a Dapr [conversation component](https://docs.dapr.io/reference/components-reference/supported-conversation/), not through a provider SDK registered in DI. Swapping providers is a YAML change, not a code change.

Observability: the Dapr sidecar emits workflow and conversation metrics and traces (see [`../dapr-shared/agent-metrics-prometheus.md`](../dapr-shared/agent-metrics-prometheus.md)). The package creates no spans or metrics of its own, but it sets W3C baggage (`agent.name`, `tool.name`, …) inside LLM and tool activities and logs prompts and tool arguments at `Debug` level. See "Observability" in `REFERENCE.md`.

## Execution Order

You MUST follow these phases in strict order:
1. **Check specification** — Check if the user specified what needs to be built.
2. **Check optional tools** — Check whether the Diagrid Dapr Dev Dashboard is installed and remember the result. Never stop, ask or install for this.
3. **Project Setup** — Create all files and folders.
4. **Verify** — Verify that the project builds.
5. **Create README.md** — Create a readme that summarizes what is built and how to run & test the application. Do not provide instructions at the end of this phase.
6. **Show final message** — Your LAST output MUST be EXACTLY the message defined in the `## Show final message` section: the closing sentence followed by the Dev Dashboard recommendation. Do NOT add any other text, summary, or commentary.

## Check specification

If you don't have enough context what to build, ask the user the following clarifying questions one by one using an interview style:

1. What is the purpose of the agent? This becomes the agent's instructions.
2. Topology: single agent, or coordinator + N specialists? (Coordinator + specialists runs all agents in one app, orchestrated by a Dapr Workflow, unless the user explicitly needs the specialists as separately deployed apps.)
3. Tool definitions: name, purpose, and argument schema for each tool.
4. LLM provider: OpenAI (default), Anthropic, Google AI (Gemini), or Ollama — this selects the conversation component.
5. Project name — used as folder and solution name. Don't use spaces.

## Prerequisites

The following must be installed by the user before this skill can run:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)
- The API key for the chosen provider (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) exported in the shell, or a local Ollama instance

Additional runtime dependencies (handled during project setup):

- NuGet package [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework) version `1.2.0` (multi-targets `net8.0`, `net9.0`, `net10.0`). It brings `Microsoft.Agents.AI`, `Microsoft.Extensions.AI`, `Dapr.Workflow` and the Dapr conversation/state clients transitively — do not add those at lower versions.
- Coordinator + specialists only: NuGet package `Dapr.Workflow` version `1.18.10`, referenced explicitly because the app defines its own workflow.
- License: the package is licensed under the Business Source License 1.1; production use without a commercial license is limited by its Additional Use Grant (see "License and usage analytics" in `REFERENCE.md`). Tell the user this in the generated README.

Optional, for inspecting workflow runs locally:

- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) for inspecting workflow runs locally. The skill only checks whether it is installed (see `## Check optional tools`); it never installs it and never stops without it.

## Check optional tools

Check once whether the optional [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) is installed by following the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`). Remember the result (`DevDashboardInstalled`) for the final message. This check never stops the skill: do not ask the user about it, do not install anything, and continue with the next step whether or not the dashboard is installed.

## Project Setup

Create the project root folder and a new ASP.NET Core web application inside it:

```shell
mkdir <ProjectRoot>
cd <ProjectRoot>
dotnet new web -n <ProjectName>
dotnet add <ProjectName> package Diagrid.AI.Microsoft.AgentFramework --version 1.2.0
```

The <ProjectName> should start with the <ProjectRoot> and end with `App`: <ProjectRoot>App.

### Folder structure (single agent)

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── resources/
│   ├── agent-workflow.yaml
│   └── llm-provider.yaml
└── <ProjectName>/
    ├── <ProjectName>.csproj
    ├── Program.cs
    ├── Properties/
    │   └── launchSettings.json
    ├── Models/
    │   └── AgentContracts.cs
    └── Tools/
        └── <ToolName>Tools.cs
```

### Folder structure (coordinator + specialists)

All agents run in **one app**; a Dapr Workflow coordinates them. Same as above, plus a `Workflows/` folder and one tools file per specialist:

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── resources/
│   ├── agent-workflow.yaml
│   └── llm-provider.yaml
└── <ProjectName>/
    ├── <ProjectName>.csproj
    ├── Program.cs
    ├── Properties/
    │   └── launchSettings.json
    ├── Models/
    │   └── AgentContracts.cs
    ├── Workflows/
    │   └── PlanWorkflow.cs
    └── Tools/
        └── <SpecialistName>Tools.cs
```

No `agent-pubsub.yaml` is needed. Only if the user explicitly needs the specialists as separately deployed apps, create one project per app instead (see "Alternative: specialists as separate apps" in `REFERENCE.md`).

**Port assignment (separate apps only).** Each app needs a unique `applicationUrl` in `Properties/launchSettings.json` and a matching `appPort` in `dapr.yaml`. Assign ports in sequence: `5100` for the coordinator, `5101` for the first specialist, `5102` for the second, and so on. Also bump `daprHTTPPort` (`3500`, `3501`, `3502`, …) and `daprGRPCPort` (`50001`, `50002`, `50003`, …) to match. Port collisions are the most common bring-up error in multi-app setups.

### .gitignore

Visual Studio style `.gitignore` file in the project root. See [`../dapr-shared/dotnet-gitignore.md`](../dapr-shared/dotnet-gitignore.md).

### dapr.yaml

Multi-app run file. Single agent and coordinator + specialists (one app): [`../dapr-shared/agent-dapr-yaml-single.md`](../dapr-shared/agent-dapr-yaml-single.md) with the .NET changes listed at the end of that file — `command: ["dotnet", "run"]` (it runs inside `appDirPath`, so no `--project`), no `configFilePath` line, and `appPort: 5100`. Specialists as separate apps: the .NET variant in [`../dapr-shared/agent-dapr-yaml-multi.md`](../dapr-shared/agent-dapr-yaml-multi.md).

### resources/agent-workflow.yaml

Workflow state store (actor-enabled). See [`../dapr-shared/agent-statestore-workflow.md`](../dapr-shared/agent-statestore-workflow.md). This is **required**: `resourcesPath: ./resources` in `dapr.yaml` replaces the default components from `dapr init`, so without an `actorStateStore: "true"` component in this folder the workflow engine will not start.

There is no separate `agent-memory.yaml` for .NET — conversation turns for a session are held in the session workflow's own state, which lives in this store.

### resources/llm-provider.yaml

Dapr Conversation component; its `metadata.name` is what you pass as `conversationComponentName`. Pick one: [OpenAI](../dapr-shared/agent-llm-openai.md) | [Anthropic](../dapr-shared/agent-llm-anthropic.md) | [Google AI](../dapr-shared/agent-llm-googleai.md) | [Ollama](../dapr-shared/agent-llm-ollama.md).

### Properties/launchSettings.json

Configures the ASP.NET Core port, which must match `appPort` in `dapr.yaml`. See `REFERENCE.md`.

### .csproj

Targets `net10.0` and references `Diagrid.AI.Microsoft.AgentFramework` `1.2.0`; the coordinator + specialists topology also references `Dapr.Workflow` `1.18.10`. See `REFERENCE.md`.

### Program.cs

Single agent: calls `AddDaprAgents()`, declares the agent with `WithAgent(agentName:, conversationComponentName:, instructions:, tools:)`, and maps `POST /run` onto `IDaprAgentInvoker` with a session. Coordinator + specialists: registers every agent with `WithAgent(...)` and the coordinating workflow via `AddDaprAgents(registrations: ...)`, maps `POST /run` to schedule the workflow (returns `202 Accepted`) and `GET /status/{instanceId}`. See `REFERENCE.md`.

### Workflows/PlanWorkflow.cs (coordinator + specialists only)

A Dapr Workflow that runs the specialists with `context.RunAgentAsync(context.GetAgent(name), message)` (each as a durable child workflow) and passes their answers to the coordinator agent. Workflow determinism rules apply. See `REFERENCE.md`.

### Models/AgentContracts.cs

Record types for the HTTP request/response. Must be serializable since Dapr persists workflow state. See `REFERENCE.md`.

### Tools/<ToolName>Tools.cs

Tool definitions using `AIFunctionFactory.Create(..., name: "<ToolName>")` — the `name` is what the LLM sees and what the agent's instructions must reference. See [`../dapr-shared/agent-tools-dotnet.md`](../dapr-shared/agent-tools-dotnet.md).

### local.http

HTTP request file for testing. See `REFERENCE.md`.

## Verify

**IMPORTANT: After Project Setup you MUST run these exact verification instructions:**

1. Run `dotnet build` on the csproj file to check for build errors.
2. Instruct the user to start the application with `dapr run -f .` in the project root.

## Create README.md

**IMPORTANT: After Verify you MUST run these instructions:**

Create a README.md file inside the <ProjectRoot> folder with the sections:
1. Summary of what this folder contains.
2. Architecture description (Microsoft Agent Framework agents executed as Dapr Workflows, LLM reached via the conversation component). **DO NOT suggest to run Redis separately since it's part of the Dapr installation and is running in a container already.**
3. A mermaid diagram of the agent(s), tools, and (if multi-agent) the coordinating workflow.
4. How to start with `dapr run -f .`.
5. How to call the `POST /run` endpoint via curl (and, for coordinator + specialists, `GET /status/{instanceId}`) and link to `local.http`.
6. The **Diagrid Dapr Dev Dashboard** section, copied from the **README section** of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md): why it is useful, the install command for each OS (macOS / Linux and Windows) and the run command (`diagrid-dev-dashboard`, http://localhost:9090).
7. How to run with Diagrid Catalyst: [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md).
8. A short "License" note: `Diagrid.AI.Microsoft.AgentFramework` is licensed under the Business Source License 1.1, with a link to its `LICENSE.md` (see "License and usage analytics" in `REFERENCE.md`).
9. Next steps: run the `review-agent-tools`, `review-agent-memory`, `review-agent-orchestration` and `review-agent-observability` skills to audit the generated agent.

See `REFERENCE.md` for Program.cs, Tools, and model templates.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below followed by the Dev Dashboard recommendation — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> agent application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled` (installed → start it; not installed → install it). Use it as written, including the link and the commands. Nothing may follow it.
