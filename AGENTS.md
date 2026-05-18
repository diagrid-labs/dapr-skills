# AGENTS.md

This repository contains skill definitions for building Dapr Workflow and Dapr Agents applications. The skills follow the [Agent Skills specification](https://agentskills.io/home) and can be used with any compatible AI coding assistant.

## Repository structure

- `.claude/skills/` — Skill files organized by language/framework
  - `shared/` — Shared content referenced by multiple skills (prereq checks, component YAMLs, tool templates, observability, running instructions)

### Workflow skills

  - `check-prereq-dotnet/SKILL.md` — Skill for checking .NET prerequisites
  - `check-prereq-aspire/SKILL.md` — Skill for checking .NET Aspire prerequisites
  - `check-prereq-python/SKILL.md` — Skill for checking Python prerequisites
  - `create-workflow-dotnet/SKILL.md` — Skill for creating Dapr Workflow apps with .NET
  - `create-workflow-dotnet/REFERENCE.md` — Detailed reference examples for the .NET skill
  - `create-workflow-python/SKILL.md` — Skill for creating Dapr Workflow apps with Python
  - `create-workflow-python/REFERENCE.md` — Detailed reference examples for the Python skill
  - `create-workflow-aspire/SKILL.md` — Skill for creating Dapr Workflow apps with Aspire
  - `create-workflow-aspire/REFERENCE.md` — Detailed reference examples for the Aspire skill
  - `create-workflow-from-diagram/SKILL.md` — Skill for scaffolding a Dapr Workflow app from a diagram image (PNG/JPG/GIF/WebP) or a BPMN 2.0 XML file, in Go, Python, .NET, Java, or JavaScript
  - `create-workflow-from-diagram/REFERENCE.md` — Detailed reference for the diagram skill (IR, input paths, per-language notes)
  - `review-workflow-determinism/{SKILL,REFERENCE}.md` — Reviews workflow bodies for non-determinism hazards
  - `review-workflow-activity/{SKILL,REFERENCE}.md` — Reviews activities for idempotency, error handling, conventions
  - `review-workflow-management/{SKILL,REFERENCE}.md` — Reviews HTTP management endpoints

### Agents skills

  - `check-prereq-agent-python/SKILL.md` — Prerequisites for Python Dapr Agents (native `dapr-agents` SDK or Diagrid framework wrappers)
  - `check-prereq-agent-dotnet/SKILL.md` — Prerequisites for .NET Dapr Agents (Microsoft Agent Framework)
  - `create-agent-python/{SKILL,REFERENCE}.md` — Scaffolds a Python agent; interview selects one of 8 frameworks (`dapr-agents`, `openai-agents`, `langgraph`, `crewai`, `pydantic-ai`, `adk`, `strands`, `deepagents`), topology (single-agent vs coordinator+specialists), and pattern. Native scaffolds include observability by default (Zipkin + Prometheus + Grafana via `docker-compose.observability.yaml`).
  - `create-agent-dotnet/{SKILL,REFERENCE}.md` — Scaffolds a .NET agent using Microsoft Agent Framework + `IDaprAgentInvoker`; produces OSS-Dapr component YAMLs that the upstream Catalyst quickstart omits.
  - `review-agent-tools/{SKILL,REFERENCE}.md` — Reviews tool definitions (idempotency, docstrings, payload size, exception handling)
  - `review-agent-memory/{SKILL,REFERENCE}.md` — Reviews memory + state-store configuration
  - `review-agent-orchestration/{SKILL,REFERENCE}.md` — Reviews multi-agent pub/sub topic conventions, loop safety, port collisions
  - `review-agent-observability/{SKILL,REFERENCE}.md` — Reviews tracing + metrics + structured logging (native `dapr-agents` only; silent on framework wrappers)

## Usage

**Verify your environment (user-invoked only):**

The `check-prereq-xxx` skills are opt-in and must **only** be run when the user explicitly asks for them. They include `check-prereq-dotnet`, `check-prereq-aspire`, `check-prereq-python` for workflows, and `check-prereq-agent-python`, `check-prereq-agent-dotnet` for agents. Do **NOT** run them automatically as part of, or before, a `create-*` invocation — they are separate, user-invoked skills, not an implicit pre-step.

**Build a new workflow application:**

Run the appropriate `create-workflow-xxx` skill to scaffold the project: `create-workflow-dotnet`, `create-workflow-aspire`, or `create-workflow-python` from a text spec, or `create-workflow-from-diagram` from an image or BPMN file. Each skill lists the prerequisites it expects to be installed and assumes they are already in place.

**Build a new agent application:**

Run the appropriate `create-agent-xxx` skill: `create-agent-python` (covers native `dapr-agents` and the seven Diagrid framework wrappers) or `create-agent-dotnet`. Single-agent and coordinator+specialist topologies are supported via the interview step.

**Review an existing workflow application** (run any combination, in any order):

- `review-workflow-determinism` — flags non-deterministic constructs in workflow bodies that would break replay.
- `review-workflow-activity` — flags idempotency, error-handling, and convention issues inside activities.
- `review-workflow-management` — checks the HTTP management surface (start, status, terminate, pause, resume, raise-event, purge) against the canonical shape used by the `create-workflow-*` skills.

**Review an existing agent application** (run any combination, in any order):

- `review-agent-tools` — flags idempotency, docstring quality, unbounded returns, and swallowed exceptions in tool functions.
- `review-agent-memory` — checks `actorStateStore: "true"` on the workflow store, memory-class appropriateness, secret management on LLM keys.
- `review-agent-orchestration` — checks multi-agent pub/sub topic conventions, loop safety (`max_iterations`), agent-registry wiring, port collisions.
- `review-agent-observability` — checks tracing config, sampling rate, structured logging, and trace propagation on outbound calls (native `dapr-agents` only).

All review skills are read-only and emit a structured report with stable rule ids: `DWF-DET-NNN`, `DWF-ACT-NNN`, `DWF-MGT-NNN` for workflow reviews; `DAG-TOOL-NNN`, `DAG-MEM-NNN`, `DAG-ORCH-NNN`, `DAG-OBS-NNN` for agent reviews.

## Repository prerequisites

All skills require:

- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.17+)

### .NET skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- C# language server support (for code diagnostics)

### .NET Aspire skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Aspire CLI](https://aspire.dev/get-started/install-cli/)
- C# language server support (for code diagnostics)

### Python skills

- Python 3.11+ for agent skills, 3.12+ for workflow skills — [download Python](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- Python language server support (for code diagnostics)

### Agent skills (both languages)

- At least one LLM provider: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` env var, or a local [Ollama](https://ollama.com/) instance on `http://localhost:11434`.
- Native Python `dapr-agents` projects with observability: no extra install — the generated `docker-compose.observability.yaml` runs Zipkin + Prometheus + Grafana as containers.

## Guidelines for skill files

- Skill files are Markdown documents in `.claude/skills/<skill-name>/SKILL.md`
- Each skill directory should also include a `REFERENCE.md` with full code examples and detailed explanations
- Skill front-matter fields: `name`, `description`
- Each skill should include sections for: prerequisite checks, project setup, folder structure, verify, and a final message
- Use `<PlaceholderName>` syntax for values the user should replace (e.g., `<ProjectName>`, `<ProjectNamespace>`)
- Code examples should be complete and runnable, not snippets
- The SKILL.md file should be minimal; detailed code examples belong in `REFERENCE.md`
- Include "Key points" sections after code examples to explain important concepts
- Skills must perform all prerequisite checks before creating any files
- Skills must be able to work on MacOS, Linux, and Windows environments.
- Shared content goes in `.claude/skills/shared/`; SKILL.md and REFERENCE.md files reference shared files to avoid duplication.

## Supported tools

These skills follow the [Agent Skills specification](https://agentskills.io/home) and are compatible with AI coding assistants that support it, including:

- [Claude Code](https://claude.com/product/claude-code)
- [OpenAI Codex](https://openai.com/index/introducing-codex/)
- [GitHub Copilot](https://github.com/features/copilot)
- [Google Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Cursor](https://www.cursor.com/)
- [Windsurf](https://windsurf.com/)
