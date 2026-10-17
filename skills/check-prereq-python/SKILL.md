---
name: check-prereq-python
description: Checks prerequisites for building Dapr Workflow apps in Python. Use for "check prerequisites for Python" or "verify Python environment".
allowed-tools:
  - Bash(uname -s)
  - Bash(python --version)
  - Bash(python3 --version)
  - Bash(uv --version)
  - Read
---

# Check Prerequisites for Dapr Workflow Python

## Overview

This skill checks whether all prerequisites are installed for building Dapr Workflow applications in Python. Run this skill before using the `create-workflow-python` skill.

## Prerequisites

The following must be installed:

- [Python 3.12+](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Astral)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)

## Prerequisite Checks

**Run ALL of these checks. Check steps 2-6 in parallel. Track which checks pass and which fail.**

### Step 1: Detect Operating System

Read the file at [`../dapr-shared/prereq-detect-os.md`](../dapr-shared/prereq-detect-os.md) and follow those instructions.

### Step 2: Check the Python LSP plugin

Read the file at [`../dapr-shared/prereq-check-python-lsp.md`](../dapr-shared/prereq-check-python-lsp.md) and follow those instructions.

### Step 3: Check uv

Read the file at [`../dapr-shared/prereq-check-uv.md`](../dapr-shared/prereq-check-uv.md) and follow those instructions.

### Step 4: Check Python SDK version

Read the file at [`../dapr-shared/prereq-check-python-sdk.md`](../dapr-shared/prereq-check-python-sdk.md) and follow those instructions.

### Step 5: Check Docker or Podman

Read the file at [`../dapr-shared/prereq-check-docker-podman.md`](../dapr-shared/prereq-check-docker-podman.md) and follow those instructions.

### Step 6: Check Dapr CLI

Read the file at [`../dapr-shared/prereq-check-dapr-cli.md`](../dapr-shared/prereq-check-dapr-cli.md) and follow those instructions.

## Show final message

After all checks are complete, report the results:

- List each check and whether it passed or failed.
- For any failed checks, provide the relevant install link from the Prerequisites section.
- If all checks passed, inform the user they can proceed with the `create-workflow-python` skill.
