---
name: create-agent-python
description: This skill creates a durable AI agent application in Python with the Dapr Agents SDK or a Diagrid framework wrapper. Use this skill when the user asks to "create an agent in Python", "write a Python Dapr agent", "build an agent app in Python", "scaffold a Dapr Agents project", or "create a multi-agent orchestrator in Python".
allowed-tools:
  - Write
  - Edit
  - Bash(mkdir:*)
  - Bash(curl:*)
  - Bash(uv venv:*)
  - Bash(uv sync:*)
  - Bash(uv lock:*)
  - Bash(dapr:*)
  - mcp__ide__getDiagnostics
---

# Create a Python Agent Application

## Overview

This skill describes how to create a durable AI agent application in Python. Two paths are supported:

- **Native** — the [`dapr-agents`](https://github.com/dapr/dapr-agents) SDK. This is the Dapr Agents framework proper; it is Python-only. Its `DurableAgent` runs on Dapr Workflow, reaches the LLM through a Dapr conversation component, and persists conversation memory in a Dapr state store.
- **Framework wrappers** — the [`diagrid`](https://pypi.org/project/diagrid/) distribution, which runs an agent you have already written in another framework (LangGraph, CrewAI, Strands, …) on Dapr Workflow so that each node / LLM call / tool call becomes a durable activity. One distribution, one extra per framework.

Single agent or coordinator + specialists, either way.

## Execution Order

You MUST follow these phases in strict order:
1. **Check specification** — Check if the user specified what needs to be built.
2. **Project Setup** — Create all files and folders.
3. **Verify** — Verify that the project builds.
4. **Create README.md** — Create a readme that summarizes what is built and how to run & test the application. Do not provide instructions at the end of this phase.
5. **Show final message** — Your LAST output MUST be EXACTLY the message defined in the `## Show final message` section. Do NOT add any other text, summary, or commentary after it.

## Check specification

If you don't have enough context what to build, ask the user the following clarifying questions one by one using an interview style:

1. What is the purpose of the agent (or agent team)? This becomes the agent's `role` and `instructions`.
2. Topology: a single agent, or a coordinator + N specialists?
3. Framework: `dapr-agents` (native, the default) or one of the `diagrid` wrapper extras. **Resolve the wrapper list at this point rather than reciting one** — see "Resolving the framework list" below.
4. Pattern (only if Q3 selected native `dapr-agents` AND Q2 selected single-agent): `augmented-llm` (default), `prompt-chaining`, `routing`, `parallelization`, `orchestrator-workers`, or `evaluator-optimizer`. **Skip this question entirely** if the user picked a wrapper extra — those frameworks define their own agent loop and the pattern concept does not apply.
5. Tool definitions: name, purpose, and argument schema for each tool the agent should expose.
6. LLM provider: OpenAI, Anthropic, Google Gemini, or local Ollama. Native `dapr-agents` routes this through a Dapr conversation component; wrappers usually let the wrapped framework call the provider directly with an API key from the environment.
7. Include observability by default? (**recommended: yes** for native `dapr-agents`; default `no` for wrappers — they ship their own observability.)
8. Project name — used as the folder name. Don't use spaces.

### Resolving the framework list

The wrapper extras live in one place — the `[project.optional-dependencies]` table of [`diagridio/python-ai`'s `pyproject.toml`](https://github.com/diagridio/python-ai/blob/main/pyproject.toml) — and PyPI republishes that table verbatim as the distribution's `provides_extra` metadata. Read it instead of hardcoding it:

```shell
curl -s https://pypi.org/pypi/diagrid/json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['info']['version']); print('\n'.join(e for e in d['info']['provides_extra'] if e not in ('agent-core','all')))"
```

Offer the user the extras that command prints. `agent-core` is the shared base every extra pulls in, and `all` is a meta-extra — neither is a framework choice, so both are filtered out above.

If the command fails (no network), fall back to the snapshot in `REFERENCE.md` and **tell the user it is a snapshot with a date on it**, so a missing framework is understood as staleness rather than as unsupported.

## Prerequisites

The following must be installed by the user before this skill can run:

- [Python](https://www.python.org/downloads/) `>=3.11,<3.14` — the bound both `dapr-agents` and `diagrid` declare
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Astral)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)
- At least one LLM provider env var (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) or a local [Ollama](https://ollama.com/) instance

Additional runtime dependencies (handled during project setup):

- Python package: `dapr-agents>=1.0` (native) **or** `diagrid[<extra>]>=0.4` (wrappers). These are floors, not pins — the exact resolved set is captured in `uv.lock` during Verify. See `REFERENCE.md`.

Optional, for inspecting workflow runs locally:

- The [Diagrid Dev Dashboard](https://www.diagrid.io/blog/improving-the-local-dapr-workflow-experience-diagrid-dashboard) is a separate container the user starts themselves — `dapr init` does not provision it: `docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest`

## Project Setup

Create the project root folder inside the current location where the terminal is open:

```shell
mkdir <ProjectRoot>
cd <ProjectRoot>
```

The <ProjectName> should start with the <ProjectRoot> and end with `-agent`: <ProjectRoot>-agent.

### Folder structure (single agent)

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── docker-compose.observability.yaml    # (native only, if observability enabled)
├── resources/
│   ├── agent-memory.yaml
│   ├── agent-workflow.yaml
│   ├── llm-provider.yaml
│   └── tracing.yaml                      # (native only, if observability enabled)
└── <ProjectName>/
    ├── pyproject.toml
    ├── main.py
    ├── tools.py
    ├── models.py
    └── logging_config.py                 # (native only, if observability enabled)
```

### Folder structure (coordinator + specialists)

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── docker-compose.observability.yaml    # (native only)
├── resources/
│   ├── agent-memory.yaml
│   ├── agent-workflow.yaml
│   ├── agent-pubsub.yaml
│   ├── agent-registry.yaml
│   ├── llm-provider.yaml
│   └── tracing.yaml                      # (native only)
├── coordinator/
│   ├── pyproject.toml
│   ├── main.py
│   ├── tools.py
│   ├── models.py
│   └── logging_config.py              # (native only, if observability enabled)
└── <specialist-N>/
    ├── pyproject.toml
    ├── main.py
    ├── tools.py
    ├── models.py
    └── logging_config.py              # (native only, if observability enabled)
```

### .gitignore

Python `.gitignore` file in the project root. See `REFERENCE.md`.

### dapr.yaml

Multi-app run file. Single-agent: see [`../shared/agent-dapr-yaml-single.md`](../shared/agent-dapr-yaml-single.md). Multi-agent: see [`../shared/agent-dapr-yaml-multi.md`](../shared/agent-dapr-yaml-multi.md).

### resources/agent-memory.yaml

Conversation memory state store. See [`../shared/agent-statestore-memory.md`](../shared/agent-statestore-memory.md).

### resources/agent-workflow.yaml

Workflow state store (actor-enabled). See [`../shared/agent-statestore-workflow.md`](../shared/agent-statestore-workflow.md).

### resources/agent-pubsub.yaml (multi-agent only)

Pub/sub component for handoff. See [`../shared/agent-pubsub-redis.md`](../shared/agent-pubsub-redis.md).

### resources/agent-registry.yaml (multi-agent only)

Agent discovery state store. See [`../shared/agent-statestore-registry.md`](../shared/agent-statestore-registry.md).

### resources/llm-provider.yaml

Dapr Conversation component. Pick one: [OpenAI](../shared/agent-llm-openai.md) | [Anthropic](../shared/agent-llm-anthropic.md) | [Ollama](../shared/agent-llm-ollama.md).

### resources/tracing.yaml (native, observability on)

Dapr `Configuration` with tracing enabled. See [`../shared/agent-tracing-zipkin.md`](../shared/agent-tracing-zipkin.md) (default) or [`../shared/agent-tracing-otlp.md`](../shared/agent-tracing-otlp.md).

### docker-compose.observability.yaml (native, observability on)

Local Zipkin + Prometheus + Grafana. See [`../shared/agent-observability-stack.md`](../shared/agent-observability-stack.md).

### pyproject.toml

Python config file. Dependencies depend on the framework choice — see `REFERENCE.md`.

### main.py

Agent entrypoint. See `REFERENCE.md` for the native template and for how to derive the wrapper template from the wrapper's own README.

### tools.py

Tool definitions. See [`../shared/agent-tools-python.md`](../shared/agent-tools-python.md); tools for a wrapper project are defined with the wrapped framework's own decorator, not with `dapr_agents.tool`.

### models.py

Pydantic input/output types. See `REFERENCE.md`.

### logging_config.py (native, observability on)

Structured logging. See [`../shared/agent-logging-python.md`](../shared/agent-logging-python.md).

### local.http

HTTP request file for testing the agent endpoints. See `REFERENCE.md`.

## Verify

**IMPORTANT: After Project Setup you MUST run these exact verification instructions:**

1. Run `uv venv` in each `<ProjectName>` folder to create a virtual environment.
2. Run `uv sync` in each `<ProjectName>` folder to resolve and install dependencies. This writes `uv.lock` next to `pyproject.toml`.
3. Confirm `uv.lock` exists and instruct the user to commit it — the `>=` floors in `pyproject.toml` keep the project on supported versions, and `uv.lock` is what makes a checkout reproduce byte-for-byte.

## Create README.md

**IMPORTANT: After Verify you MUST run these instructions:**

Create a README.md file inside the <ProjectRoot> folder.

The README contains the following sections:
1. Summary of what this folder contains.
2. Architecture description that explains the technology stack (which framework, which LLM provider, which state/pubsub components). **DO NOT suggest to run Redis separately since it's part of the Dapr installation and is running in a container already.**
3. A mermaid diagram of the agent (or agent team) that shows the role, tools, and (if multi-agent) the pub/sub topics.
4. How to start the application using the Dapr CLI (`dapr run -f .`).
5. How to call the agent endpoints (POST the task, GET the workflow state). Include curl examples and link to `local.http`.
6. **Observability section** (native only, observability on): how to start the observability stack (`docker compose -f docker-compose.observability.yaml up -d`), the Zipkin URL (http://localhost:9411), Grafana URL (http://localhost:3000), and Prometheus URL (http://localhost:9099). Mention the Diagrid Dev Dashboard as a separate, optional container the reader starts themselves (`docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest` → http://localhost:8080) — it is **not** part of `dapr init`.
7. How to run with Diagrid Catalyst: [`../shared/running-with-catalyst.md`](../shared/running-with-catalyst.md).

See `REFERENCE.md` for the pyproject.toml templates, the native `main.py`, the wrapper entry-point table, tool patterns, and observability wiring.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> agent application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.
