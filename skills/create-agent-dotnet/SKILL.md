---
name: create-agent-dotnet
description: This skill creates a durable AI agent application in .NET using Microsoft Agent Framework on Dapr Workflow. Use this skill when the user asks to "create an agent in .NET", "build an agent app in C#", or "scaffold a .NET agent with Microsoft Agent Framework".
allowed-tools:
  - Write
  - Edit
  - Bash(mkdir:*)
  - Bash(dotnet:*)
  - Bash(dapr:*)
  - mcp__ide__getDiagnostics
---

# Create a .NET Agent Application

## Overview

This skill describes how to create a durable AI agent application in .NET.

> **On naming.** [Dapr Agents](https://github.com/dapr/dapr-agents) is a **Python-only** framework and is not used here. The .NET path is [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/) (`Microsoft.Agents.AI` + `Microsoft.Extensions.AI`) executed durably on Dapr Workflow by the [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework) package. That package turns every LLM call and every tool call into its own workflow activity, so an agent run survives a process restart and resumes from the last completed step. The `Dapr` in `AddDaprAgents()` / `IDaprAgentInvoker` names that workflow runtime — it is not the Python framework.

The LLM is reached through a Dapr [conversation component](https://docs.dapr.io/reference/components-reference/supported-conversation/), not through a provider SDK registered in DI. Swapping providers is a YAML change, not a code change.

Observability is not baked in. Dapr's own sidecar metrics and traces cover the workflow layer (see [`../shared/agent-metrics-prometheus.md`](../shared/agent-metrics-prometheus.md)); anything above that comes from the wrapped framework's OpenTelemetry support or from your own APM.

## Execution Order

You MUST follow these phases in strict order:
1. **Check specification** — Check if the user specified what needs to be built.
2. **Project Setup** — Create all files and folders.
3. **Verify** — Verify that the project builds.
4. **Create README.md** — Create a readme that summarizes what is built and how to run & test the application. Do not provide instructions at the end of this phase.
5. **Show final message** — Your LAST output MUST be EXACTLY the message defined in the `## Show final message` section. Do NOT add any other text, summary, or commentary after it.

## Check specification

If you don't have enough context what to build, ask the user the following clarifying questions one by one using an interview style:

1. What is the purpose of the agent? This becomes the agent's instructions.
2. Topology: single agent, or coordinator + N specialists?
3. Tool definitions: name, purpose, and argument schema for each tool.
4. LLM provider: OpenAI (default), Anthropic, or Ollama — this selects the conversation component.
5. Project name — used as folder and solution name. Don't use spaces.

## Prerequisites

The following must be installed by the user before this skill can run:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)
- The API key for the chosen provider (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) exported in the shell, or a local Ollama instance

Additional runtime dependencies (handled during project setup):

- One NuGet package: [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework) (multi-targets `net8.0`, `net9.0`, `net10.0`). It brings `Microsoft.Agents.AI`, `Microsoft.Extensions.AI`, `Dapr.Workflow` and the Dapr conversation/state clients transitively — do not add those separately.

Optional, for inspecting workflow runs locally:

- The [Diagrid Dev Dashboard](https://www.diagrid.io/blog/improving-the-local-dapr-workflow-experience-diagrid-dashboard) is a separate container the user starts themselves — `dapr init` does not provision it: `docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest`

## Project Setup

Create the project root folder and a new ASP.NET Core web application inside it:

```shell
mkdir <ProjectRoot>
cd <ProjectRoot>
dotnet new web -n <ProjectName>
dotnet add <ProjectName> package Diagrid.AI.Microsoft.AgentFramework
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

Same as above, but under `<ProjectRoot>/` create one subfolder per app. The root-level `resources/` additionally contains `agent-pubsub.yaml`.

**Port assignment.** Each app needs a unique `applicationUrl` in `Properties/launchSettings.json` and a matching `appPort` in `dapr.yaml`. Assign ports in sequence: `5100` for the coordinator, `5101` for the first specialist, `5102` for the second, and so on. Also bump `daprHTTPPort` (`3500`, `3501`, `3502`, …) and `daprGRPCPort` (`50001`, `50002`, `50003`, …) to match. Port collisions are the most common bring-up error in multi-agent setups.

### .gitignore

Visual Studio style `.gitignore` file in the project root. See [`../shared/dotnet-gitignore.md`](../shared/dotnet-gitignore.md).

### dapr.yaml

Multi-app run file. Single-agent: [`../shared/agent-dapr-yaml-single.md`](../shared/agent-dapr-yaml-single.md) (replace the `command:` block with `["dotnet", "run", "--project", "<ProjectName>"]`, and drop the `configFilePath` line — the tracing Configuration is part of the Python observability scaffold only). Multi-agent: [`../shared/agent-dapr-yaml-multi.md`](../shared/agent-dapr-yaml-multi.md).

### resources/agent-workflow.yaml

Workflow state store (actor-enabled). See [`../shared/agent-statestore-workflow.md`](../shared/agent-statestore-workflow.md). This is **required**: `resourcesPath: ./resources` in `dapr.yaml` replaces the default components from `dapr init`, so without an `actorStateStore: "true"` component in this folder the workflow engine will not start.

There is no separate `agent-memory.yaml` for .NET — conversation turns for a session are held in the session workflow's own state, which lives in this store.

### resources/agent-pubsub.yaml (multi-agent only)

Pub/sub component. See [`../shared/agent-pubsub-redis.md`](../shared/agent-pubsub-redis.md).

### resources/llm-provider.yaml

Dapr Conversation component; its `metadata.name` is what you pass as `conversationComponentName`. Pick one: [OpenAI](../shared/agent-llm-openai.md) | [Anthropic](../shared/agent-llm-anthropic.md) | [Ollama](../shared/agent-llm-ollama.md).

### Properties/launchSettings.json

Configures the ASP.NET Core port, which must match `appPort` in `dapr.yaml`. See `REFERENCE.md`.

### .csproj

Targets `net10.0` with the single required NuGet package. See `REFERENCE.md`.

### Program.cs

Calls `AddDaprAgents()`, declares the agent with `WithAgent(agentName:, conversationComponentName:, instructions:, tools:)`, and maps `POST /run` onto `IDaprAgentInvoker`. See `REFERENCE.md`.

### Models/AgentContracts.cs

Record types for the HTTP request/response. Must be serializable since Dapr persists workflow state. See `REFERENCE.md`.

### Tools/<ToolName>Tools.cs

Tool definitions using `AIFunctionFactory.Create(...)`. See [`../shared/agent-tools-dotnet.md`](../shared/agent-tools-dotnet.md).

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
3. A mermaid diagram of the agent(s), tools, and (if multi-agent) pub/sub topics.
4. How to start with `dapr run -f .`.
5. How to call the `POST /run` endpoint via curl and link to `local.http`.
6. How to inspect workflow execution with the Diagrid Dev Dashboard — stating that it is a separate `docker run` the user starts, not something `dapr init` provisions.
7. How to run with Diagrid Catalyst: [`../shared/running-with-catalyst.md`](../shared/running-with-catalyst.md).

See `REFERENCE.md` for Program.cs, Tools, and model templates.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> agent application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.
