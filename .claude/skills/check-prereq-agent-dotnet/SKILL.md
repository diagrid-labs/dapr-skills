---
name: check-prereq-agent-dotnet
description: This skill checks prerequisites for building Dapr Agent apps in .NET. Use this skill when the user asks to "check prerequisites for .NET agents", "verify .NET agent environment", or "check .NET agent setup".
allowed-tools:
  - Bash(uname -s)
  - Bash(dotnet --version)
  - Bash(curl:*)
  - Bash(powershell:*)
  - Bash(dapr:*)
  - Bash(docker info:*)
  - Bash(podman info:*)
---

# Check Prerequisites for Dapr Agents .NET

## Overview

This skill checks whether all prerequisites are installed for building Dapr Agent applications in .NET (Microsoft Agent Framework wrapped with the Diagrid runner). Run this skill before using the `create-agent-dotnet` skill.

## Prerequisites

The following must be installed:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.17+)
- At least one LLM provider available: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, or a local Ollama instance on `http://localhost:11434`

## Prerequisite Checks

**Run ALL of these checks. Check steps 2–6 in parallel. Track which checks pass and which fail.**

### Step 1: Detect Operating System

Read the file at [`../shared/prereq-detect-os.md`](../shared/prereq-detect-os.md) and follow those instructions.

### Step 2: Check the C# LSP plugin

Read the file at [`../shared/prereq-check-csharp-lsp.md`](../shared/prereq-check-csharp-lsp.md) and follow those instructions.

### Step 3: Check .NET SDK version

Read the file at [`../shared/prereq-check-dotnet-sdk.md`](../shared/prereq-check-dotnet-sdk.md) and follow those instructions.

### Step 4: Check Docker or Podman

Read the file at [`../shared/prereq-check-docker-podman.md`](../shared/prereq-check-docker-podman.md) and follow those instructions.

### Step 5: Check Dapr CLI

Read the file at [`../shared/prereq-check-dapr-cli.md`](../shared/prereq-check-dapr-cli.md) and follow those instructions.

### Step 6: Check LLM provider availability

Read the file at [`../shared/prereq-check-llm-provider.md`](../shared/prereq-check-llm-provider.md) and follow those instructions.

## Show final message

After all checks are complete, report the results:

- List each check and whether it passed or failed.
- For any failed checks, provide the relevant install / configuration link from the Prerequisites section.
- If all checks passed, inform the user they can proceed with the `create-agent-dotnet` skill.
