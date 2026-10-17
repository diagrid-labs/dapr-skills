---
name: check-prereq-aspire
description: This skill checks prerequisites for building Dapr Workflow apps with .NET Aspire. Use this skill when the user asks to "check prerequisites for Aspire", "verify Aspire environment", or "check Aspire setup".
allowed-tools:
  - Bash(uname -s)
  - Bash(aspire --version)
  - Bash(~/.aspire/bin/aspire --version)
  - Bash(~/.dotnet/tools/aspire --version)
  - Read
---

# Check Prerequisites for Dapr Workflow .NET Aspire

## Overview

This skill checks whether all prerequisites are installed for building Dapr Workflow applications with .NET Aspire. Run this skill before using the `create-workflow-aspire` skill.

## Prerequisites

The following must be installed:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Aspire CLI](https://aspire.dev/get-started/install-cli/) — install via `curl -sSL https://aspire.dev/install.sh | bash` or `irm https://aspire.dev/install.ps1 | iex`
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)

## Prerequisite Checks

**Run ALL of these checks. Check steps 2-6 in parallel. Track which checks pass and which fail.**

### Step 1: Detect Operating System

Read the file at [`../dapr-shared/prereq-detect-os.md`](../dapr-shared/prereq-detect-os.md) and follow those instructions.

### Step 2: Check the C# LSP plugin

Read the file at [`../dapr-shared/prereq-check-csharp-lsp.md`](../dapr-shared/prereq-check-csharp-lsp.md) and follow those instructions.

### Step 3: Check .NET SDK

Read the file at [`../dapr-shared/prereq-check-dotnet-sdk.md`](../dapr-shared/prereq-check-dotnet-sdk.md) and follow those instructions.

### Step 4: Check Docker or Podman

Read the file at [`../dapr-shared/prereq-check-docker-podman.md`](../dapr-shared/prereq-check-docker-podman.md) and follow those instructions.

### Step 5: Check Dapr CLI

Read the file at [`../dapr-shared/prereq-check-dapr-cli.md`](../dapr-shared/prereq-check-dapr-cli.md) and follow those instructions.

### Step 6: Check Aspire CLI

Read the file at [`../dapr-shared/prereq-check-aspire-cli.md`](../dapr-shared/prereq-check-aspire-cli.md) and follow those instructions.

## Show final message

After all checks are complete, report the results:

- List each check and whether it passed or failed.
- For any failed checks, provide the relevant install link from the Prerequisites section.
- If all checks passed, inform the user they can proceed with the `create-workflow-aspire` skill.
