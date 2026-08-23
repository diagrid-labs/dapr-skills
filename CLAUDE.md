# CLAUDE.md

This repository contains Claude Code skill definitions for building Dapr Workflow applications and durable AI agent applications that run on Dapr Workflow. For other AI coding tools, see [AGENTS.md](AGENTS.md).

## Repository structure

- `skills/` — Skill files organized by language/framework
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
  - `review-workflow-determinism/SKILL.md` — Skill for reviewing existing workflow code for non-determinism hazards
  - `review-workflow-determinism/REFERENCE.md` — Detailed reference and worked example for the determinism review skill
  - `review-workflow-activity/SKILL.md` — Skill for reviewing existing activity code for idempotency, error handling, and convention issues
  - `review-workflow-activity/REFERENCE.md` — Detailed reference and worked example for the activity review skill
  - `review-workflow-management/SKILL.md` — Skill for reviewing the HTTP management endpoints exposed for Dapr Workflows
  - `review-workflow-management/REFERENCE.md` — Detailed reference and worked example for the management endpoint review skill

### Agent skills

  - `check-prereq-agent-python/SKILL.md` — Prerequisites for Python agents (`dapr-agents` SDK or a `diagrid` framework wrapper)
  - `check-prereq-agent-dotnet/SKILL.md` — Prerequisites for .NET agents (Microsoft Agent Framework on Dapr Workflow)
  - `create-agent-python/SKILL.md` — Skill for creating durable agent apps in Python
  - `create-agent-python/REFERENCE.md` — Detailed reference examples for the Python agent skill
  - `create-agent-dotnet/SKILL.md` — Skill for creating durable agent apps in .NET
  - `create-agent-dotnet/REFERENCE.md` — Detailed reference examples for the .NET agent skill
  - `review-agent-tools/SKILL.md` — Skill for reviewing agent tool definitions (idempotency, descriptions, payload size, exception handling)
  - `review-agent-tools/REFERENCE.md` — Detailed reference and worked example for the tool review skill
  - `review-agent-memory/SKILL.md` — Skill for reviewing agent memory and state-store configuration
  - `review-agent-memory/REFERENCE.md` — Detailed reference and worked example for the memory review skill
  - `review-agent-orchestration/SKILL.md` — Skill for reviewing multi-agent pub/sub conventions, loop safety, and port assignment
  - `review-agent-orchestration/REFERENCE.md` — Detailed reference and worked example for the orchestration review skill
  - `review-agent-observability/SKILL.md` — Skill for reviewing agent tracing, metrics, and structured logging
  - `review-agent-observability/REFERENCE.md` — Detailed reference and worked example for the observability review skill

## Usage

**Verify your environment (user-invoked only):**

The `check-prereq-xxx` skills (`check-prereq-dotnet`, `check-prereq-aspire`, `check-prereq-python`, `check-prereq-agent-python`, `check-prereq-agent-dotnet`) are opt-in and must **only** be run when the user explicitly asks for them (e.g., "check prerequisites for .NET", "verify Aspire environment"). Do **NOT** run them automatically as part of, or before, a `create-workflow-xxx` or `create-agent-xxx` invocation — they are separate, user-invoked skills, not an implicit pre-step.

**Build a new workflow application:**

Run the appropriate `create-workflow-xxx` skill to scaffold the project: `create-workflow-dotnet`, `create-workflow-aspire`, or `create-workflow-python` from a text spec, or `create-workflow-from-diagram` from an image or BPMN file (output language: Go, Python, .NET, Java, or JavaScript). Each skill lists the prerequisites it expects to be installed and assumes they are already in place.

**Build a new agent application:**

Run `create-agent-python` or `create-agent-dotnet` to scaffold a durable agent app. `create-agent-python` covers the native [`dapr-agents`](https://github.com/dapr/dapr-agents) SDK and the [`diagrid`](https://pypi.org/project/diagrid/) framework wrappers; `create-agent-dotnet` covers [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/) running on Dapr Workflow via [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework). Both support a single agent and a coordinator + specialists topology.

**Review an existing workflow application** (run any combination, in any order):

- `review-workflow-determinism` — flags non-deterministic constructs in workflow bodies that would break replay.
- `review-workflow-activity` — flags idempotency, error-handling, and convention issues inside activities.
- `review-workflow-management` — checks the HTTP management surface (start, status, terminate, pause, resume, raise-event, purge) against the canonical shape used by the `create-workflow-*` skills.

**Review an existing agent application** (run any combination, in any order):

- `review-agent-tools` — flags idempotency, description quality, unbounded returns, and swallowed exceptions in tool functions.
- `review-agent-memory` — checks `actorStateStore: "true"` on the workflow store, memory-class appropriateness, and secret handling for LLM API keys.
- `review-agent-orchestration` — checks multi-agent pub/sub topic conventions, loop bounds, agent-registry wiring, and port collisions.
- `review-agent-observability` — checks tracing configuration, sampling rate, structured logging, and trace propagation on outbound calls.

All review skills are read-only (`Read`, `Grep`, `Glob` only), emit a structured report defined by `skills/shared/review-report-format.md`, and use stable rule ids: `DWF-DET-NNN`, `DWF-ACT-NNN`, `DWF-MGT-NNN` for workflow reviews; `DAG-TOOL-NNN`, `DAG-MEM-NNN`, `DAG-ORCH-NNN`, `DAG-OBS-NNN` for agent reviews.

## Repository prerequisites

All skills require:

- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)

### .NET skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)

### .NET Aspire skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Aspire CLI](https://aspire.dev/get-started/install-cli/)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)

### Python skills

- Python 3.12+ for workflow skills, Python 3.11+ for agent skills — [download Python](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [Pyright LSP Plugin](https://claude.com/plugins/pyright-lsp)

### Agent skills (both languages)

- At least one LLM provider: an `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` environment variable, or a local [Ollama](https://ollama.com/) instance on `http://localhost:11434`.
- Python agent projects accept Python 3.11+ (the `diagrid` distribution requires `>=3.11,<3.14`).

## Guidelines for skill files

- Skill files are Markdown documents in `skills/<skill-name>/SKILL.md`
- Each skill directory should also include a `REFERENCE.md` with full code examples and detailed explanations
- Skill front-matter fields: `name`, `description`, `model` (e.g. `opus`)
- Each skill should include sections for: prerequisite checks, project setup, folder structure, verify, and a final message
- Use `<PlaceholderName>` syntax for values the user should replace (e.g., `<ProjectName>`, `<ProjectNamespace>`)
- Code examples should be complete and runnable, not snippets
- The SKILL.md file should be minimal; detailed code examples belong in `REFERENCE.md`
- Include "Key points" sections after code examples to explain important concepts
- Skills must perform all prerequisite checks before creating any files
- Skills must be able to work on MacOS, Linux, and Windows environments.
- Shared content goes in `skills/shared/`; SKILL.md and REFERENCE.md files reference shared files to avoid duplication.
