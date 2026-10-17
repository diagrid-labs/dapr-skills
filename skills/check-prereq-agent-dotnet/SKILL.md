---
name: check-prereq-agent-dotnet
description: This skill checks prerequisites for building durable AI agents in .NET with Microsoft Agent Framework on Dapr Workflow. Use this skill when the user asks to "check prerequisites for .NET agents", "verify .NET agent environment", or "check .NET agent setup".
allowed-tools:
  - Bash(uname -s)
  - Bash(dotnet --version)
  - Read
---

# Check Prerequisites for .NET Agents

## Overview

This skill checks whether all prerequisites are installed for building durable AI agents in .NET. Run this skill before using the `create-agent-dotnet` skill.

> **On naming.** [Dapr Agents](https://github.com/dapr/dapr-agents) is a **Python-only** framework; there is no Dapr Agents SDK for .NET. The .NET path is [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/) (`Microsoft.Agents.AI`, `Microsoft.Extensions.AI`) executed durably on Dapr Workflow by the [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework) package. Every agent turn — each LLM call and each tool call — becomes a workflow activity, which is where the durability comes from. The `Dapr` in the .NET type names (`AddDaprAgents`, `IDaprAgentInvoker`) refers to that workflow runtime, not to the Python framework.

## Prerequisites

The following must be installed:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)
- At least one LLM provider reachable by a Dapr [conversation component](https://docs.dapr.io/reference/components-reference/supported-conversation/): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` (Gemini via `conversation.googleai`), or a local Ollama instance on `http://localhost:11434`

## Prerequisite Checks

**Run ALL of these checks. Check steps 2–6 in parallel. Track which checks pass and which fail.**

### Step 1: Detect Operating System

Read the file at [`../dapr-shared/prereq-detect-os.md`](../dapr-shared/prereq-detect-os.md) and follow those instructions.

### Step 2: Check the C# LSP plugin

Read the file at [`../dapr-shared/prereq-check-csharp-lsp.md`](../dapr-shared/prereq-check-csharp-lsp.md) and follow those instructions.

### Step 3: Check .NET SDK version

Read the file at [`../dapr-shared/prereq-check-dotnet-sdk.md`](../dapr-shared/prereq-check-dotnet-sdk.md) and follow those instructions.

### Step 4: Check Docker or Podman

Read the file at [`../dapr-shared/prereq-check-docker-podman.md`](../dapr-shared/prereq-check-docker-podman.md) and follow those instructions.

### Step 5: Check Dapr CLI

Read the file at [`../dapr-shared/prereq-check-dapr-cli.md`](../dapr-shared/prereq-check-dapr-cli.md) and follow those instructions.

### Step 6: Check LLM provider availability

Read the file at [`../dapr-shared/prereq-check-llm-provider.md`](../dapr-shared/prereq-check-llm-provider.md) and follow those instructions.

## Show final message

After all checks are complete, report the results:

- List each check and whether it passed or failed.
- For any failed checks, provide the relevant install / configuration link from the Prerequisites section.
- If all checks passed, inform the user they can proceed with the `create-agent-dotnet` skill.
