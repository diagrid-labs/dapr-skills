---
name: check-prereq-agent-python
description: This skill checks prerequisites for building Dapr Agent apps in Python. Use this skill when the user asks to "check prerequisites for Python agents", "verify Python agent environment", or "check Python agent setup".
allowed-tools:
  - Bash(uname -s)
  - Bash(python --version)
  - Bash(uv --version)
  - Bash(uv pip show:*)
  - Bash(uv pip list:*)
  - Bash(curl:*)
  - Bash(powershell:*)
  - Bash(dapr:*)
  - Bash(docker info:*)
  - Bash(podman info:*)
---

# Check Prerequisites for Dapr Agents Python

## Overview

This skill checks whether all prerequisites are installed for building Dapr Agent applications in Python (native `dapr-agents` SDK or a Diagrid framework wrapper). Run this skill before using the `create-agent-python` skill.

## Prerequisites

The following must be installed:

- [Python 3.11+](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Astral)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.17+)
- [dapr-agents](https://pypi.org/project/dapr-agents/) (Python SDK, version 1.0+) reachable from the package index
- At least one LLM provider available: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, or a local Ollama instance on `http://localhost:11434`

## Prerequisite Checks

**Run ALL of these checks. Check steps 2–8 in parallel. Track which checks pass and which fail.**

### Step 1: Detect Operating System

Read the file at [`../shared/prereq-detect-os.md`](../shared/prereq-detect-os.md) and follow those instructions.

### Step 2: Check the Python LSP plugin

Read the file at [`../shared/prereq-check-python-lsp.md`](../shared/prereq-check-python-lsp.md) and follow those instructions.

### Step 3: Check uv

Read the file at [`../shared/prereq-check-uv.md`](../shared/prereq-check-uv.md) and follow those instructions.

### Step 4: Check Python SDK version

Read the file at [`../shared/prereq-check-python-sdk.md`](../shared/prereq-check-python-sdk.md) and follow those instructions, **with this override**: the shared check rejects anything below Python 3.12 because it targets workflow skills. Agent skills accept **Python 3.11+**. If the installed version is `3.11.x`, treat this check as **passing**, not failing. Only fail the check for `3.10.x` and below.

### Step 5: Check Docker or Podman

Read the file at [`../shared/prereq-check-docker-podman.md`](../shared/prereq-check-docker-podman.md) and follow those instructions.

### Step 6: Check Dapr CLI

Read the file at [`../shared/prereq-check-dapr-cli.md`](../shared/prereq-check-dapr-cli.md) and follow those instructions.

### Step 7: Check dapr-agents SDK availability

Read the file at [`../shared/prereq-check-dapr-agents-sdk.md`](../shared/prereq-check-dapr-agents-sdk.md) and follow those instructions.

### Step 8: Check LLM provider availability

Read the file at [`../shared/prereq-check-llm-provider.md`](../shared/prereq-check-llm-provider.md) and follow those instructions.

## Show final message

After all checks are complete, report the results:

- List each check and whether it passed or failed.
- For any failed checks, provide the relevant install / configuration link from the Prerequisites section.
- If all checks passed, inform the user they can proceed with the `create-agent-python` skill.
