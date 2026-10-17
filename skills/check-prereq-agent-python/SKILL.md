---
name: check-prereq-agent-python
description: This skill checks prerequisites for building durable AI agents in Python with the Dapr Agents SDK or a Diagrid framework wrapper. Use this skill when the user asks to "check prerequisites for Python agents", "verify Python agent environment", or "check Python agent setup".
allowed-tools:
  - Bash(uname -s)
  - Bash(python --version)
  - Bash(python3 --version)
  - Bash(uv --version)
  - Read
---

# Check Prerequisites for Python Agents

## Overview

This skill checks whether all prerequisites are installed for building durable AI agents in Python — either with the native [`dapr-agents`](https://github.com/dapr/dapr-agents) SDK (the Dapr Agents framework, which is Python-only) or with a [`diagrid`](https://pypi.org/project/diagrid/) framework wrapper. Run this skill before using the `create-agent-python` skill.

## Prerequisites

The following must be installed:

- [Python](https://www.python.org/downloads/) `>=3.11,<3.14` — the bound both `dapr-agents` and `diagrid` declare
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Astral)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)
- [dapr-agents](https://pypi.org/project/dapr-agents/) `>=1.0.9`, checked as a local install only (native path only — a `diagrid[<extra>]` project gets it transitively, and either way the project installs it with `uv sync`)
- At least one LLM provider available: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, or a local Ollama instance on `http://localhost:11434`

## Prerequisite Checks

**Run ALL of these checks. Check steps 2–8 in parallel. Track which checks pass and which fail.**

### Step 1: Detect Operating System

Read the file at [`../dapr-shared/prereq-detect-os.md`](../dapr-shared/prereq-detect-os.md) and follow those instructions.

### Step 2: Check the Python LSP plugin

Read the file at [`../dapr-shared/prereq-check-python-lsp.md`](../dapr-shared/prereq-check-python-lsp.md) and follow those instructions.

### Step 3: Check uv

Read the file at [`../dapr-shared/prereq-check-uv.md`](../dapr-shared/prereq-check-uv.md) and follow those instructions.

### Step 4: Check Python SDK version

Read the file at [`../dapr-shared/prereq-check-python-sdk.md`](../dapr-shared/prereq-check-python-sdk.md) and follow those instructions, **with this override**: the shared check rejects anything below Python 3.12 because it targets workflow skills. Agent skills accept **3.11 up to but excluding 3.14**. Treat `3.11.x` as **passing**. Fail `3.10.x` and below, and also fail `3.14` and above — neither `dapr-agents` nor `diagrid` resolves there, both declaring `>=3.11,<3.14`.

### Step 5: Check Docker or Podman

Read the file at [`../dapr-shared/prereq-check-docker-podman.md`](../dapr-shared/prereq-check-docker-podman.md) and follow those instructions.

### Step 6: Check Dapr CLI

Read the file at [`../dapr-shared/prereq-check-dapr-cli.md`](../dapr-shared/prereq-check-dapr-cli.md) and follow those instructions.

### Step 7: Check dapr-agents SDK availability

Read the file at [`../dapr-shared/prereq-check-dapr-agents-sdk.md`](../dapr-shared/prereq-check-dapr-agents-sdk.md) and follow those instructions.

### Step 8: Check LLM provider availability

Read the file at [`../dapr-shared/prereq-check-llm-provider.md`](../dapr-shared/prereq-check-llm-provider.md) and follow those instructions.

## Show final message

After all checks are complete, report the results:

- List each check and whether it passed or failed.
- For any failed checks, provide the relevant install / configuration link from the Prerequisites section.
- If all checks passed, inform the user they can proceed with the `create-agent-python` skill.
- If the user mentioned HolmesGPT, warn them that `diagrid[holmesgpt]` cannot be resolved from PyPI (its pins conflict with `diagrid[agent-core]`), so `create-agent-python` does not scaffold it.
