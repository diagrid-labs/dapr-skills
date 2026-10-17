# CLAUDE.md

This repository contains Claude Code skill definitions for building Dapr Workflow applications and durable AI agent applications that run on Dapr Workflow. For other AI coding tools, see [AGENTS.md](AGENTS.md).

## Repository structure

- `skills/` — Skill files organized by language/framework
  - `dapr-shared/` — Support skill holding shared content referenced by multiple skills (prereq checks, component YAMLs, tool templates, observability, running instructions). It has its own `SKILL.md` so it installs next to the other skills.

### Workflow skills

  - `check-prereq-dotnet/SKILL.md` — Skill for checking .NET prerequisites
  - `check-prereq-aspire/SKILL.md` — Skill for checking .NET Aspire prerequisites
  - `check-prereq-python/SKILL.md` — Skill for checking Python prerequisites
  - `create-workflow-dotnet/SKILL.md` — Skill for creating Dapr Workflow apps with .NET
  - `create-workflow-dotnet/REFERENCE.md` — Detailed reference examples for the .NET skill
  - `create-workflow-python/SKILL.md` — Skill for creating Dapr Workflow apps with Python
  - `create-workflow-python/REFERENCE.md` — Detailed reference examples for the Python skill
  - `create-workflow-typescript/SKILL.md` — Skill for creating a Dapr building-blocks app (Workflow, service invocation, pub/sub, bindings, jobs, state, secrets) with TypeScript
  - `create-workflow-typescript/REFERENCE.md` — Detailed reference examples for the TypeScript skill
  - `migrate-workflow-typescript/SKILL.md` — Skill for migrating an existing TypeScript/Node.js application to Dapr incrementally
  - `migrate-workflow-typescript/REFERENCE.md` — Detection heuristics, infra-to-component mapping, and verified before/after code for the migration skill
  - `add-workflow-dotnet/SKILL.md` — Skill for adding Dapr Workflow to an existing ASP.NET Core project (plain or Aspire) after a plan the user approves
  - `add-workflow-dotnet/REFERENCE.md` — Detection heuristics, plan template, edit recipes and run-doc template for the add skill
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

### Pub/sub skills

  - `create-pubsub-dotnet/SKILL.md` — Skill for creating Dapr pub/sub apps in .NET (dapr run or Aspire; declarative, programmatic or streaming subscriptions)
  - `create-pubsub-dotnet/REFERENCE.md` — Detailed reference examples for the .NET pub/sub create skill
  - `create-pubsub-python/SKILL.md` — Skill for creating Dapr pub/sub apps in Python (FastAPI with dapr run; declarative, programmatic or streaming subscriptions)
  - `create-pubsub-python/REFERENCE.md` — Detailed reference examples for the Python pub/sub create skill
  - `add-pubsub-dotnet/SKILL.md` — Skill for adding Dapr pub/sub to an existing ASP.NET Core project (plain or Aspire) after a plan the user approves
  - `add-pubsub-dotnet/REFERENCE.md` — Detection heuristics, plan template, edit recipes and run-doc template for the .NET pub/sub add skill
  - `add-pubsub-python/SKILL.md` — Skill for adding Dapr pub/sub to an existing Python FastAPI app after a plan the user approves
  - `add-pubsub-python/REFERENCE.md` — Detection heuristics, plan template, edit recipes and run-doc template for the Python pub/sub add skill
  - `review-pubsub-publishing/SKILL.md` — Skill for reviewing Dapr pub/sub publishing code in .NET and Python (swallowed publish failures, pub/sub names, content types, client lifetime, bulk publish, payload size)
  - `review-pubsub-publishing/REFERENCE.md` — Detailed reference and worked example for the pub/sub publishing review skill
  - `review-pubsub-subscriptions/SKILL.md` — Skill for reviewing Dapr pub/sub subscriptions and handlers (declarative, programmatic and streaming: CloudEvent handling, response statuses, idempotency, dead-letter handling, duplicate subscriptions)
  - `review-pubsub-subscriptions/REFERENCE.md` — Detailed reference and worked example for the pub/sub subscriptions review skill
  - `review-pubsub-components/SKILL.md` — Skill for reviewing Dapr pub/sub configuration (components, Subscription files, resiliency, dapr.yaml and Aspire AppHost wiring: secrets, scopes, dead-letter retry policies, app-id and port collisions)
  - `review-pubsub-components/REFERENCE.md` — Detailed reference and worked example for the pub/sub components review skill

## Usage

**Verify your environment (user-invoked only):**

The `check-prereq-xxx` skills (`check-prereq-dotnet`, `check-prereq-aspire`, `check-prereq-python`, `check-prereq-agent-python`, `check-prereq-agent-dotnet`) are opt-in and must **only** be run when the user explicitly asks for them (e.g., "check prerequisites for .NET", "verify Aspire environment"). Do **NOT** run them automatically as part of, or before, a `create-workflow-xxx`, `create-agent-xxx` or `create-pubsub-xxx` invocation — they are separate, user-invoked skills, not an implicit pre-step.

**Build a new workflow application:**

Run the appropriate `create-workflow-xxx` skill to scaffold the project: `create-workflow-dotnet`, `create-workflow-aspire`, `create-workflow-python`, or `create-workflow-typescript` from a text spec, or `create-workflow-from-diagram` from an image or BPMN file (output language: Go, Python, .NET, Java, or JavaScript). `create-workflow-typescript` differs from the other three: it scaffolds a Workflow whose activities also exercise service invocation, pub/sub, bindings, jobs, state, and secrets, rather than a workflow-only app. Each skill lists the prerequisites it expects to be installed and assumes they are already in place.

**Migrate an existing application to Dapr:**

Run `migrate-workflow-typescript` on an existing TypeScript/Node.js application — it is not a scaffolder. It reads the codebase first (no changes), maps existing service calls, messaging, scheduled jobs, secrets, and state access onto Dapr building blocks, presents a Migration Assessment Report for approval, and only then applies confirmed changes one integration point at a time, verifying after each with the project's own build/test commands. It works on a dedicated git branch and never commits or pushes unless the user opts into per-step commits. This is a fundamentally different kind of skill from the `create-workflow-xxx` family: it never assumes a fixed scenario and never rewrites whole files.

**Add Dapr Workflow to an existing .NET project:**

Run `add-workflow-dotnet` on an existing ASP.NET Core project (net8.0, net9.0 or net10.0, optionally inside an Aspire solution). It inspects the solution, shows an Add Workflow Plan for approval, then adds `Dapr.Workflow`, the Dapr wiring, the workflow and its activities, and the management endpoints with targeted edits, building after each step and running the existing tests at the end. It never changes git state and writes a `DAPR-WORKFLOW.md` instead of editing the README.

**Build a new agent application:**

Run `create-agent-python` or `create-agent-dotnet` to scaffold a durable agent app. `create-agent-python` covers the native [`dapr-agents`](https://github.com/dapr/dapr-agents) SDK and the [`diagrid`](https://pypi.org/project/diagrid/) framework wrappers; `create-agent-dotnet` covers [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/) running on Dapr Workflow via [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework). Both support a single agent and a coordinator + specialists topology.

**Build a new pub/sub application:**

Run `create-pubsub-dotnet` or `create-pubsub-python` to scaffold a publisher and subscriber app (`dapr run`, or Aspire for .NET; Python uses FastAPI). The role (publisher, subscriber or both) and the subscription type are asked once; declarative is the default, followed by programmatic and streaming.

**Add pub/sub to an existing project:**

Run `add-pubsub-dotnet` or `add-pubsub-python` on an existing project (.NET: ASP.NET Core, plain or Aspire; Python: FastAPI only). They inspect it, show a plan for approval, and then apply targeted edits, keeping the subscription type the project already uses. They never change git state and write a `DAPR-PUBSUB.md` instead of editing the README.

**Review an existing workflow application** (run any combination, in any order):

- `review-workflow-determinism` — flags non-deterministic constructs in workflow bodies that would break replay.
- `review-workflow-activity` — flags idempotency, error-handling, and convention issues inside activities.
- `review-workflow-management` — checks the HTTP management surface (start, status, terminate, pause, resume, raise-event, purge) against the canonical shape used by the `create-workflow-*` skills.

**Review an existing agent application** (run any combination, in any order):

- `review-agent-tools` — flags idempotency, description quality, unbounded returns, and swallowed exceptions in tool functions.
- `review-agent-memory` — checks `actorStateStore: "true"` on the workflow store, memory-class appropriateness, and secret handling for LLM API keys.
- `review-agent-orchestration` — checks multi-agent pub/sub topic conventions, loop bounds, agent-registry wiring, and port collisions.
- `review-agent-observability` — checks tracing configuration, sampling rate, structured logging, and trace propagation on outbound calls.

**Review an existing pub/sub application** (run any combination, in any order):

- `review-pubsub-publishing` — flags swallowed publish failures, wrong pub/sub names, content types, client lifetime, bulk-publish partial failures and payload size.
- `review-pubsub-subscriptions` — flags CloudEvent handling, response statuses, idempotency, dead-letter handling and duplicate subscriptions across types.
- `review-pubsub-components` — checks pub/sub components, Subscription files, resiliency policies and `dapr.yaml`/Aspire wiring (inline secrets, scopes, app-id and port collisions).

Rule ids use the prefixes `DPS-PUB-NNN`, `DPS-SUB-NNN` and `DPS-CFG-NNN`.

All review skills are read-only (`Read`, `Grep`, `Glob` only), emit a structured report defined by `skills/dapr-shared/review-report-format.md`, and use stable rule ids: `DWF-DET-NNN`, `DWF-ACT-NNN`, `DWF-MGT-NNN` for workflow reviews; `DAG-TOOL-NNN`, `DAG-MEM-NNN`, `DAG-ORCH-NNN`, `DAG-OBS-NNN` for agent reviews; `DPS-PUB-NNN`, `DPS-SUB-NNN`, `DPS-CFG-NNN` for pub/sub reviews.

## Repository prerequisites

All skills require:

- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)
- Optional: [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) to inspect workflow runs, sidecars, components and logs locally. The `create-*` skills check whether it is installed (`diagrid-dev-dashboard --version`) without ever stopping, and end with a tip to install or start it.

### .NET skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)

### .NET Aspire skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Aspire CLI](https://aspire.dev/get-started/install-cli/)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)

### Python skills

- Python 3.12+ for workflow skills, Python 3.11–3.13 for agent skills — [download Python](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [Pyright LSP Plugin](https://claude.com/plugins/pyright-lsp)
- `add-pubsub-python` accepts Python 3.10+ in existing projects

### TypeScript skills

- [Node.js 22+ (LTS)](https://nodejs.org/en/download)
- [TypeScript LSP Plugin](https://claude.com/plugins/typescript-lsp)

### Agent skills (both languages)

- At least one LLM provider: an `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` environment variable, or a local [Ollama](https://ollama.com/) instance on `http://localhost:11434`.
- Python agent projects accept Python 3.11–3.13 (the `diagrid` distribution requires `>=3.11,<3.14`).

## Guidelines for skill files

- Skill files are Markdown documents in `skills/<skill-name>/SKILL.md`
- Each skill directory should also include a `REFERENCE.md` with full code examples and detailed explanations
- Skill front-matter fields: `name`, `description` and optionally `allowed-tools` — nothing else (the support skill `dapr-shared` additionally hides itself, see Cross-CLI checks). `allowed-tools` lists no wildcard shell tools (`Bash`, `Bash(dotnet:*)`) and no `mcp__` tools; exact commands such as `Bash(uname -s)` are fine. Other keys (`model`, `disable-model-invocation`, ...) mean different things in Claude Code, Codex CLI and Copilot CLI.
- Each skill should include sections for: prerequisite checks, project setup, folder structure, verify, and a final message
- Use `<PlaceholderName>` syntax for values the user should replace (e.g., `<ProjectName>`, `<ProjectNamespace>`)
- Code examples should be complete and runnable, not snippets
- The SKILL.md file should be minimal; detailed code examples belong in `REFERENCE.md`
- Include "Key points" sections after code examples to explain important concepts
- Skills must perform all prerequisite checks before creating any files
- Skills must be able to work on MacOS, Linux, and Windows environments.
- Shared content goes in `skills/dapr-shared/`; SKILL.md and REFERENCE.md files reference it as `../dapr-shared/<file>` to avoid duplication. Do not reference files outside the `skills/` folder from skill files — installers copy only the `skills/<name>/` folders.
- Every folder under `skills/` must contain a `SKILL.md` whose `name` equals the folder name and that has a `description`.
- Run `node scripts/validate-skills.mjs` (and `node --test "scripts/test/*.test.mjs"` when changing the scripts) before committing skill changes; CI runs both.

## Pub/sub placeholder contract

The pub/sub skills build an application from the domain the user describes. Every template is written against the placeholder vocabulary in `skills/dapr-shared/pubsub-placeholders.md`, and there is no default scenario: when a prompt names no domain, the skill asks. `scripts/validate-skills.mjs` enforces this with four checks (`scripts/lib/pubsub-validation.mjs`, unit-tested in `scripts/test/pubsub-validation.test.mjs`):

- **no sample domain in instructions** — order-processing identifiers (`OrderPlaced`, `OrdersTopic`, `handle_order_event`, …) may appear only after a `## Worked example` heading. Adding one to an instruction means the file has stopped being a template.
- **placeholders are defined and used** — every placeholder a pub/sub file uses is defined in the vocabulary, and every defined placeholder is used. Project and infrastructure placeholders (`<solution-path>`, `<app-id>`, `<route-prefix>`, …) are exempt via that family's `localPlaceholders` set in `scripts/lib/family-validation.mjs` (`FAMILIES`), which is where every vocabulary check now lives; `scripts/lib/pubsub-validation.mjs` only re-exports it.
- **templates link the placeholder vocabulary** — a `dapr-shared` pub/sub template that uses placeholders points at `pubsub-placeholders.md`.
- **pubsub: CEL matches cast with int()** — a routing `match` comparing `event.data.<field>` with a number wraps the field in `int()`. `double()` is rejected too: it fires, but mixing the two routes inconsistently across a project.
- **evals: manifests are well-formed** — each `evals/<skill>/evals.json` is valid JSON, names its folder, numbers cases from 1, and gives every case the six keys and at least one expectation.

## Authoring checks

`scripts/validate-skills.mjs` enforces these rules (`scripts/lib/authoring-validation.mjs`). The first three apply to every `create-*` skill; the last is repo-wide:

- **create skills verify their output** — a `## Verify` section that runs, not shows, and includes a command that compiles or builds. `create-workflow-from-diagram` is exempt in `BUILD_EXEMPT` because it deliberately runs no builds.
- **create skills declare Write and Edit** — a skill that constrains `allowed-tools` must declare the tools it writes files with.
- **create skills point at their review skills** — so a user who scaffolds a project discovers the audit skills.
- **shared reference files are linked** — no Markdown file under `dapr-shared/references/` is unreferenced by any skill. (Non-Markdown files there are not checked.)

## Cross-CLI checks

The skills install into Claude Code, Codex CLI and Copilot CLI. `scripts/lib/frontmatter-validation.mjs` (unit-tested in `scripts/test/frontmatter-validation.test.mjs`) enforces:

- **frontmatter keys** — only `name`, `description`, `allowed-tools`. Support skills (`SUPPORT_SKILLS`, today `dapr-shared`) may also set `disable-model-invocation: true` and `user-invocable: false`, which Claude Code and Copilot CLI honour.
- **support skills are hidden** — `dapr-shared` also ships `agents/openai.yaml` with `policy.allow_implicit_invocation: false`, the only way to stop Codex CLI selecting it. The check fails if any of the three settings is missing.
- **allowed-tools** — no wildcard shell tools and no MCP tools.
- **description budget** — descriptions are always in context, and Codex budgets its whole skill list at about 8,000 characters and shortens descriptions first. Keep each description to 400 characters (hard limit `MAX_DESCRIPTION_CHARS`) and the total under 7,000 (`MAX_TOTAL_DESCRIPTION_CHARS`, which only ratchets down). Lead with the verb ("Creates ...", "Reviews ...") instead of "This skill ...".
- **description YAML** — a description is an unquoted YAML value, so it must not contain `: `. Rephrase it.
- **description similarity** — two descriptions that read alike compete for the same trigger. The hard limit (`MAX_DESCRIPTION_SIMILARITY`) sits just above the language twins; other pairs above the 50% target print a `WARN`. After changing a description, re-run the triggering check in `evals/README.md`.

Lower the `MAX_*` constants whenever descriptions get shorter, never raise them.

Placeholder vocabularies are per family (`scripts/lib/family-validation.mjs`, `FAMILIES`): pub/sub uses `dapr-shared/pubsub-placeholders.md`, workflow uses `dapr-shared/workflow-placeholders.md`. Adding a family means adding a row there, not a second copy of the checks.

## Review report counts

Every review skill's `Found:` line must equal the findings printed beneath its section headings. `scripts/validate-skills.mjs` enforces this for the example reports in the review skills' documentation (`reviews: example Found: lines match their findings`, from `scripts/lib/review-validation.mjs`), because an example whose counts drift teaches the error to the model that patterns off it. The rule itself lives in `skills/dapr-shared/review-report-format.md`: write the sections first, count the bullets, then copy the four numbers into the line.

When adding a placeholder, define it in the vocabulary in the same change, or the build fails.
