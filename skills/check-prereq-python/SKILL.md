---
name: check-prereq-python
description: This skill checks prerequisites for building Dapr Workflow apps in Python. Use this skill when the user asks to "check prerequisites for Python", "verify Python environment", or "check Python setup".
allowed-tools:
  - Bash(uname -s)
  - Bash(python --version)
  - Bash(uv --version)
  - Bash(dapr:*)
  - Bash(docker info:*)
  - Bash(podman info:*)
  - mcp__ide__getDiagnostics
---

# Check Prerequisites for Dapr Workflow Python

## Overview

This skill checks whether all prerequisites are installed for building Dapr Workflow applications in Python. Run this skill before using the `create-workflow-python` skill.

## Prerequisites

The following must be installed:

- [Python 3.12+](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Astral)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)

## Prerequisite Checks

**Run ALL of these checks. Check steps 2-6 in parallel. Track which checks pass and which fail.**

### Step 1: Detect Operating System

Read the file at [`../shared/prereq-detect-os.md`](../shared/prereq-detect-os.md) and follow those instructions.

### Step 2: Check the Python LSP plugin

Read the file at [`../shared/prereq-check-python-lsp.md`](../shared/prereq-check-python-lsp.md) and follow those instructions.

### Step 3: Check uv

Read the file at [`../shared/prereq-check-uv.md`](../shared/prereq-check-uv.md) and follow those instructions.

### Step 4: Check Python SDK version

Read the file at [`../shared/prereq-check-python-sdk.md`](../shared/prereq-check-python-sdk.md) and follow those instructions.

### Step 5: Check Docker or Podman

Read the file at [`../shared/prereq-check-docker-podman.md`](../shared/prereq-check-docker-podman.md) and follow those instructions.

### Step 6: Check Dapr CLI

Read the file at [`../shared/prereq-check-dapr-cli.md`](../shared/prereq-check-dapr-cli.md) and follow those instructions.

## Show final message

After all checks are complete, report the results:

- List each check and whether it passed or failed.
- For any failed checks, provide the relevant install link from the Prerequisites section.
- If all checks passed, inform the user they can proceed with the `create-workflow-python` skill.
