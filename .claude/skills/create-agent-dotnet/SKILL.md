---
name: create-agent-dotnet
description: This skill creates a Dapr Agents application in .NET. Use this skill when the user asks to "create an agent in .NET", "write a .NET Dapr agent", "build an agent app in C#", or "scaffold a .NET agent with Microsoft Agent Framework".
allowed-tools:
  - Write
  - Edit
  - Bash(mkdir:*)
  - Bash(dotnet:*)
  - Bash(dapr:*)
  - mcp__ide__getDiagnostics
---

# Create Dapr Agents .NET Application

## Overview

This skill describes how to create a Dapr Agents application in .NET, using the Microsoft Agent Framework (`Microsoft.Extensions.AI` + `Microsoft.Agents.AI`) wrapped with the Diagrid runner (`IDaprAgentInvoker`).

Note: There is no first-class native Dapr Agents SDK for .NET. Observability is not baked in by default — teams using .NET agents typically rely on the Diagrid Catalyst dashboard (or their own APM) rather than a separate local stack. The scaffold provides OSS-Dapr-compatible component YAMLs that the upstream `catalyst-quickstarts/agents/microsoft-dotnet` project omits.

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
4. LLM provider: OpenAI (default), Anthropic, or Azure OpenAI.
5. Project name — used as folder and solution name. Don't use spaces.

## Prerequisites

The following must be installed by the user before this skill can run:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)
- At least one LLM provider env var (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`)

Additional runtime dependencies (handled during project setup):

- NuGet packages: `Microsoft.Extensions.AI`, `Microsoft.Agents.AI`, `Diagrid.Agents.Workflow` (**the `Diagrid.Agents.Workflow` id is indicative** — verify the exact package id at [nuget.org](https://www.nuget.org/) before running `dotnet add package`. Diagrid's .NET agent runtime package may ship under a different id. Cross-check against the upstream [`diagridio/catalyst-quickstarts/agents/microsoft-dotnet`](https://github.com/diagridio/catalyst-quickstarts/tree/main/agents/microsoft-dotnet) `.csproj` for the canonical name.)
- Start the [Diagrid Dev Dashboard](https://www.diagrid.io/blog/improving-the-local-dapr-workflow-experience-diagrid-dashboard): `docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest`

## Project Setup

Create the project root folder and a new ASP.NET Core web application inside it:

```shell
mkdir <ProjectRoot>
cd <ProjectRoot>
dotnet new web -n <ProjectName>
dotnet add <ProjectName> package Microsoft.Extensions.AI
dotnet add <ProjectName> package Microsoft.Agents.AI
# VERIFY PACKAGE ID BEFORE RUNNING — check nuget.org and the upstream
# diagridio/catalyst-quickstarts/agents/microsoft-dotnet .csproj.
dotnet add <ProjectName> package Diagrid.Agents.Workflow
```

The <ProjectName> should start with the <ProjectRoot> and end with `App`: <ProjectRoot>App.

### Folder structure (single agent)

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── resources/
│   ├── agent-memory.yaml
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

Same as above, but under `<ProjectRoot>/` create one subfolder per app. The root-level `resources/` additionally contains `agent-pubsub.yaml` and `agent-registry.yaml`.

**Port assignment.** Each app needs a unique `applicationUrl` in `Properties/launchSettings.json` and a matching `appPort` in `dapr.yaml`. Assign ports in sequence: `5100` for the coordinator, `5101` for the first specialist, `5102` for the second, and so on. Also bump `daprHTTPPort` (`3500`, `3501`, `3502`, …) and `daprGRPCPort` (`50001`, `50002`, `50003`, …) to match. Port collisions are the most common bring-up error in multi-agent setups.

### .gitignore

Visual Studio style `.gitignore` file in the project root. See [`../shared/dotnet-gitignore.md`](../shared/dotnet-gitignore.md).

### dapr.yaml

Multi-app run file. Single-agent: [`../shared/agent-dapr-yaml-single.md`](../shared/agent-dapr-yaml-single.md) (replace the `command:` block with `["dotnet", "run", "--project", "<ProjectName>"]`). Multi-agent: [`../shared/agent-dapr-yaml-multi.md`](../shared/agent-dapr-yaml-multi.md).

### resources/agent-memory.yaml

Conversation memory state store. See [`../shared/agent-statestore-memory.md`](../shared/agent-statestore-memory.md).

### resources/agent-workflow.yaml

Workflow state store (actor-enabled). See [`../shared/agent-statestore-workflow.md`](../shared/agent-statestore-workflow.md).

### resources/agent-pubsub.yaml (multi-agent only)

Pub/sub component. See [`../shared/agent-pubsub-redis.md`](../shared/agent-pubsub-redis.md).

### resources/agent-registry.yaml (multi-agent only)

Agent discovery state store. See [`../shared/agent-statestore-registry.md`](../shared/agent-statestore-registry.md).

### resources/llm-provider.yaml

Dapr Conversation component. Pick one: [OpenAI](../shared/agent-llm-openai.md) | [Anthropic](../shared/agent-llm-anthropic.md) | [Ollama](../shared/agent-llm-ollama.md).

### Properties/launchSettings.json

Configures the ASP.NET Core port, which must match `appPort` in `dapr.yaml`. See `REFERENCE.md`.

### .csproj

Targets `net10.0` with the required NuGet packages. See `REFERENCE.md`.

### Program.cs

Registers Dapr Agents services, declares the agent via `AddDaprAgents().WithAgent(...)`, and maps the `POST /run` endpoint using `IDaprAgentInvoker`. See `REFERENCE.md`.

### Models/AgentContracts.cs

Record types for agent input/output. Must be serializable since Dapr persists workflow state. See `REFERENCE.md`.

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
2. Architecture description (Microsoft Agent Framework + Diagrid runner + OSS Dapr components). **DO NOT suggest to run Redis separately since it's part of the Dapr installation and is running in a container already.**
3. A mermaid diagram of the agent(s), tools, and (if multi-agent) pub/sub topics.
4. How to start with `dapr run -f .`.
5. How to call the `POST /run` endpoint via curl and link to `local.http`.
6. How to inspect workflow execution with the Diagrid Dev Dashboard.
7. How to run with Diagrid Catalyst: [`../shared/running-with-catalyst.md`](../shared/running-with-catalyst.md).

See `REFERENCE.md` for Program.cs, Tools, and model templates.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> agent application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.
