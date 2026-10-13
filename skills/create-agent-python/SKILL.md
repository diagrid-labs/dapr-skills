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

- **Native** — the [`dapr-agents`](https://github.com/dapr/dapr-agents) SDK. This is the Dapr Agents framework proper; it is Python-only. Its `DurableAgent` runs on Dapr Workflow, reaches the LLM through a Dapr conversation component, and keeps the conversation of each run in a Dapr state store.
- **Framework wrappers** — the [`diagrid`](https://pypi.org/project/diagrid/) distribution, which runs an agent you have already written in another framework (LangGraph, CrewAI, Strands, …) on Dapr Workflow so that each node / LLM call / tool call becomes a durable activity. One distribution, one extra per framework. `diagrid` is BUSL-1.1 licensed (with an Additional Use Grant, converting to Apache-2.0 on its Change Date) and its runners send one anonymous usage event per process; the generated README says both (see `REFERENCE.md`). `dapr-agents` is Apache-2.0.

Single agent or coordinator + specialists, either way. With wrappers, the coordinator is a native `dapr-agents` agent that dispatches to wrapper specialists through the agent registry (a **mixed** project); wrappers that only exchange events over pub/sub are the event-driven variant.

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
2. Topology: a single agent, or a coordinator + N specialists? For wrappers, coordinator + specialists means a native coordinator with wrapper specialists; offer the event-driven pub/sub variant only if the user asks for event-driven agents.
3. Framework: `dapr-agents` (native, the default) or one of the `diagrid` wrapper extras. **Resolve the wrapper list at this point rather than reciting one** — see "Resolving the framework list" below.
4. Pattern (only if Q3 selected native `dapr-agents` AND Q2 selected single-agent): `augmented-llm` (default), `prompt-chaining`, `routing`, `parallelization`, `orchestrator-workers`, or `evaluator-optimizer`. **Skip this question entirely** if the user picked a wrapper extra — those frameworks define their own agent loop and the pattern concept does not apply.
5. Tool definitions: name, purpose, and argument schema for each tool the agent should expose.
6. LLM provider: OpenAI, Anthropic, Google Gemini, or local Ollama. Native `dapr-agents` routes this through a Dapr conversation component; wrappers let the wrapped framework call the provider directly with an API key from the environment, and most extras bundle only an OpenAI client (see "LLM provider (wrappers)" in `REFERENCE.md`).
7. Include observability by default? (**recommended: yes**, for both paths.)
8. Project name — used as the folder name. Don't use spaces.

### Resolving the framework list

The wrapper extras live in one place — the `[project.optional-dependencies]` table of [`diagridio/python-ai`'s `pyproject.toml`](https://github.com/diagridio/python-ai/blob/main/pyproject.toml) — and PyPI republishes that table verbatim as the distribution's `provides_extra` metadata. Read it instead of hardcoding it:

```shell
curl -s https://pypi.org/pypi/diagrid/json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['info']['version']); print('\n'.join(e for e in d['info']['provides_extra'] if e not in ('agent-core','all','identity','holmesgpt')))"
```

Offer the user the extras that command prints. `agent-core` is the shared base every extra pulls in, `all` is a meta-extra and `identity` is a runtime helper — none is a framework choice. `holmesgpt` is filtered out because `diagrid[holmesgpt]` does not resolve from PyPI; if the user asks for HolmesGPT, tell them it is not supported for scaffolding and offer another framework.

If the command fails (no network), fall back to the snapshot in `REFERENCE.md` and **tell the user it is a snapshot with a date on it**, so a missing framework is understood as staleness rather than as unsupported.

## Prerequisites

The following must be installed by the user before this skill can run:

- [Python](https://www.python.org/downloads/) `>=3.11,<3.14` — the bound both `dapr-agents` and `diagrid` declare
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Astral)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)
- At least one LLM provider env var (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) or a local [Ollama](https://ollama.com/) instance

Additional runtime dependencies (handled during project setup):

- Python package: `dapr-agents>=1.0.9` (native, and the coordinator of a mixed project) **or** `diagrid[<extra>]>=0.5.3` (wrappers). These are floors, not pins — the exact resolved set is captured in `uv.lock` during Verify. See `REFERENCE.md`.

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
├── docker-compose.observability.yaml    # (if observability enabled)
├── observability/                        # (if observability enabled)
├── resources/
│   ├── agent-workflow.yaml
│   ├── llm-provider.yaml                 # (native only — see "Resources per flavor")
│   └── tracing.yaml                      # (if observability enabled)
└── <ProjectName>/
    ├── pyproject.toml
    ├── main.py
    ├── tools.py
    └── logging_config.py                 # (if observability enabled)
```

### Folder structure (coordinator + specialists)

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── docker-compose.observability.yaml    # (if observability enabled)
├── observability/                        # (if observability enabled)
├── resources/
│   ├── agent-workflow.yaml
│   ├── agent-pubsub.yaml                 # (native only — see "Resources per flavor")
│   ├── agent-registry.yaml
│   ├── llm-provider.yaml                 # (native and mixed — see "Resources per flavor")
│   └── tracing.yaml                      # (if observability enabled)
├── coordinator/                          # native dapr-agents, also in a mixed project
│   ├── pyproject.toml
│   ├── main.py
│   ├── tools.py
│   └── logging_config.py              # (if observability enabled)
└── <specialist-N>/                       # native, or a diagrid wrapper in a mixed project
    ├── pyproject.toml
    ├── main.py
    ├── tools.py
    └── logging_config.py              # (if observability enabled)
```

### Resources per flavor

Generate only the components the chosen flavor uses:

| File in `resources/` | native `dapr-agents` | `diagrid[<extra>]` wrapper | mixed (native coordinator + wrapper specialists) |
| --- | --- | --- | --- |
| `agent-workflow.yaml` | always — workflow state and, in `dapr-agents` 1.0.9, conversation memory | always — the runner executes on Dapr Workflow | always |
| `llm-provider.yaml` | always — `DaprChatClient(component_name="llm-provider")` | omit — the wrapped framework calls the provider directly | always — for the coordinator |
| `agent-registry.yaml` | multi-agent only | omit | always — the coordinator finds the specialists here |
| `agent-pubsub.yaml` | multi-agent only | event-driven variant only | omit — dispatch does not use pub/sub |
| `tracing.yaml` | observability on (Zipkin) | observability on (OTLP) | observability on (OTLP) |

Do not generate `agent-memory.yaml`: native memory is written to the `state=` store, and wrapper runners do not read or write conversation history through a state store (see "Memory" in `REFERENCE.md`). Add it, or another store, only when the generated code uses a framework memory helper that names it. In the README, list the components that were generated, not this whole table.

### .gitignore

Python `.gitignore` file in the project root. See `REFERENCE.md`.

### dapr.yaml

Multi-app run file. Single-agent: see [`../dapr-shared/agent-dapr-yaml-single.md`](../dapr-shared/agent-dapr-yaml-single.md). Multi-agent: see [`../dapr-shared/agent-dapr-yaml-multi.md`](../dapr-shared/agent-dapr-yaml-multi.md).

### resources/agent-workflow.yaml

Workflow state store (actor-enabled); native agents also keep conversation memory in it. See [`../dapr-shared/agent-statestore-workflow.md`](../dapr-shared/agent-statestore-workflow.md).

### resources/agent-pubsub.yaml (native multi-agent, wrapper event-driven variant)

Pub/sub component for agent topics and the team broadcast. See [`../dapr-shared/agent-pubsub-redis.md`](../dapr-shared/agent-pubsub-redis.md).

### resources/agent-registry.yaml (multi-agent only)

Agent discovery state store; the coordinator dispatches to the agents registered here. See [`../dapr-shared/agent-statestore-registry.md`](../dapr-shared/agent-statestore-registry.md).

### resources/llm-provider.yaml (native and mixed)

Dapr Conversation component, matching the provider from the specification. Pick one: [OpenAI](../dapr-shared/agent-llm-openai.md) | [Anthropic](../dapr-shared/agent-llm-anthropic.md) | [Google AI (Gemini)](../dapr-shared/agent-llm-googleai.md) | [Ollama](../dapr-shared/agent-llm-ollama.md). Wrapper apps do not use this file; they read the provider's API key env var (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`) and may need the provider package in `pyproject.toml` (see `REFERENCE.md`).

### resources/tracing.yaml (observability on)

Dapr `Configuration` with tracing enabled. Native: [`../dapr-shared/agent-tracing-zipkin.md`](../dapr-shared/agent-tracing-zipkin.md). Wrapper and mixed: [`../dapr-shared/agent-tracing-otlp.md`](../dapr-shared/agent-tracing-otlp.md), because the wrapper runners export app spans over OTLP gRPC and one receiver should take both. Wrapper apps also get `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` in their `dapr.yaml` `env:` block; native apps get `agent_observability=` in `main.py` (see `REFERENCE.md`).

### docker-compose.observability.yaml (observability on)

Local Zipkin (native) or Jaeger (wrapper and mixed) + Prometheus + Grafana. See [`../dapr-shared/agent-observability-stack.md`](../dapr-shared/agent-observability-stack.md).

### pyproject.toml

Python config file. Dependencies depend on the framework choice — see `REFERENCE.md`.

### main.py

Agent entrypoint. See `REFERENCE.md` for the native template, the wrapper shape and runner table, and the mixed topology.

### tools.py

Tool definitions. See [`../dapr-shared/agent-tools-python.md`](../dapr-shared/agent-tools-python.md); tools for a wrapper project are defined with the wrapped framework's own decorator, not with `dapr_agents.tool`.

### logging_config.py (observability on)

Structured logging. See [`../dapr-shared/agent-logging-python.md`](../dapr-shared/agent-logging-python.md).

### local.http

HTTP request file for testing the agent endpoints. Native: `POST /agent/run` returns an `instance_id` at once, status at `GET /agent/instances/{instance_id}`. Wrapper: `POST /agent/run` with `{"task": ...}` returns when the run is finished, status at `GET /agent/run/{workflow_id}`. See `REFERENCE.md`.

## Verify

**IMPORTANT: After Project Setup you MUST run these exact verification instructions:**

1. Run `uv venv` in each `<ProjectName>` folder to create a virtual environment.
2. Run `uv sync` in each `<ProjectName>` folder to resolve and install dependencies. This writes `uv.lock` next to `pyproject.toml`.
3. Confirm `uv.lock` exists and instruct the user to commit it — the `>=` floors in `pyproject.toml` keep the project on supported versions, and `uv.lock` is what makes a checkout reproduce byte-for-byte.
4. **Windows path length.** If `uv venv` / `uv sync` fails with a path-length error (`path longer than allowed`, `os error 206`, `os error 87`, or a DLL that will not load from `.venv`), the project folder is too deep for the 260-character Windows limit. Do not work around it by mapping drives (`subst`), creating virtual environments outside the project, or running `uv` from another folder — those leave files behind on the user's machine. Stop, tell the user that Verify did not complete and why, and suggest either moving the project to a shorter path (for example `C:\src\<ProjectRoot>`) or enabling long paths (Windows `LongPathsEnabled`), then re-running `uv sync`. Never report the build as verified when `uv.lock` was not written.

## Create README.md

**IMPORTANT: After Verify you MUST run these instructions:**

Create a README.md file inside the <ProjectRoot> folder.

The README contains the following sections:
1. Summary of what this folder contains.
2. Architecture description that explains the technology stack (which framework, which LLM provider, which state/pubsub components). **DO NOT suggest to run Redis separately since it's part of the Dapr installation and is running in a container already.**
3. A mermaid diagram of the agent (or agent team) that shows the role, tools, and (if multi-agent) the registry dispatch from the coordinator to each specialist and any pub/sub topics.
4. How to start the application using the Dapr CLI (`dapr run -f .`).
5. How to call the agent endpoints (POST the task, GET the workflow state). Include curl examples and link to `local.http`.
6. Memory: conversation history is kept per run (per workflow instance), not across runs. Do not promise cross-session memory.
7. **Observability section** (observability on): how to start the observability stack (`docker compose -f docker-compose.observability.yaml up -d`), the trace UI URL (Zipkin http://localhost:9411 for native, Jaeger http://localhost:16686 for wrapper and mixed), Grafana URL (http://localhost:3000), and Prometheus URL (http://localhost:9099). Mention the Diagrid Dev Dashboard as a separate, optional container the reader starts themselves (`docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest` → http://localhost:8080) — it is **not** part of `dapr init`.
8. **Wrapper and mixed projects:** the `diagrid` licence note and the usage analytics note with the opt-out variables (`DO_NOT_TRACK`, `SCARF_NO_ANALYTICS`, `DIAGRID_NO_ANALYTICS`); do not set an opt-out in the generated files. Mixed projects also get the "verify this end to end" note for the coordinator → specialist dispatch. Text for all three is in `REFERENCE.md`.
9. How to run with Diagrid Catalyst: [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md). For wrapper projects, also mention `diagridpy init` as an alternative (see `REFERENCE.md`).

See `REFERENCE.md` for the pyproject.toml templates, the native `main.py`, the wrapper entry-point table, the multi-agent topologies, tool patterns, and observability wiring.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> agent application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.
