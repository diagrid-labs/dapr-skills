---
name: check-prereq-dotnet
description: This skill checks prerequisites for building Dapr Workflow apps in .NET. Use this skill when the user asks to "check prerequisites for .NET", "verify .NET environment", or "check .NET setup".
allowed-tools:
  - Bash(uname -s)
  - Bash(dotnet:*)
  - Bash(dapr:*)
  - Bash(docker info:*)
  - Bash(podman info:*)
  - mcp__ide__getDiagnostics
---

# Check Prerequisites for Dapr Workflow .NET

## Overview

This skill checks whether all prerequisites are installed for building Dapr Workflow applications in .NET. Run this skill before using the `create-workflow-dotnet` skill.

## Prerequisites

The following must be installed:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)

## Prerequisite Checks

**Run ALL of these checks. Track which checks pass and which fail.**

### Step 1: Check the C# LSP plugin

Read the file at [`../shared/prereq-check-csharp-lsp.md`](../shared/prereq-check-csharp-lsp.md) and follow those instructions.

### Step 2: Detect Operating System

Read the file at [`../shared/prereq-detect-os.md`](../shared/prereq-detect-os.md) and follow those instructions.

### Step 3: Check .NET SDK

Read the file at [`../shared/prereq-check-dotnet-sdk.md`](../shared/prereq-check-dotnet-sdk.md) and follow those instructions.

### Step 4: Check Docker or Podman

Read the file at [`../shared/prereq-check-docker-podman.md`](../shared/prereq-check-docker-podman.md) and follow those instructions.

### Step 5: Check Dapr CLI

Read the file at [`../shared/prereq-check-dapr-cli.md`](../shared/prereq-check-dapr-cli.md) and follow those instructions.

## Show final message

After all checks are complete, report the results:

- List each check and whether it passed or failed.
- For any failed checks, provide the relevant install link from the Prerequisites section.
- If all checks passed, inform the user they can proceed with the `create-workflow-dotnet` skill.
