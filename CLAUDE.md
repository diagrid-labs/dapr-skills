# CLAUDE.md

This repository contains Claude Code skill definitions for building Dapr Workflow applications. For other AI coding tools, see [AGENTS.md](AGENTS.md).

## Repository structure

- `.claude/skills/` — Skill files organized by language/framework
  - `shared/` — Shared content referenced by multiple skills (prereq checks, common .NET sections, running instructions)
  - `check-prereq-dotnet/SKILL.md` — Skill for checking .NET prerequisites
  - `check-prereq-aspire/SKILL.md` — Skill for checking .NET Aspire prerequisites
  - `check-prereq-python/SKILL.md` — Skill for checking Python prerequisites
  - `create-workflow-dotnet/SKILL.md` — Skill for creating Dapr Workflow apps with .NET
  - `create-workflow-dotnet/REFERENCE.md` — Detailed reference examples for the .NET skill
  - `create-workflow-python/SKILL.md` — Skill for creating Dapr Workflow apps with Python
  - `create-workflow-python/REFERENCE.md` — Detailed reference examples for the Python skill
  - `create-workflow-aspire/SKILL.md` — Skill for creating Dapr Workflow apps with Aspire
  - `create-workflow-aspire/REFERENCE.md` — Detailed reference examples for the Aspire skill
  - `review-workflow-determinism/SKILL.md` — Skill for reviewing existing workflow code for non-determinism hazards
  - `review-workflow-determinism/REFERENCE.md` — Detailed reference and worked example for the determinism review skill
  - `review-workflow-activity/SKILL.md` — Skill for reviewing existing activity code for idempotency, error handling, and convention issues
  - `review-workflow-activity/REFERENCE.md` — Detailed reference and worked example for the activity review skill
  - `review-workflow-management/SKILL.md` — Skill for reviewing the HTTP management endpoints exposed for Dapr Workflows
  - `review-workflow-management/REFERENCE.md` — Detailed reference and worked example for the management endpoint review skill

## Usage

Two flows are supported.

**Build a new workflow application** (two steps):

1. **Check prerequisites** — Run the appropriate `check-prereq-xxx` skill first to verify your environment (e.g., `check-prereq-dotnet`, `check-prereq-aspire`, or `check-prereq-python`).
2. **Create the workflow** — Once the prerequisites pass, run the corresponding skill to scaffold the project: `create-workflow-dotnet`, `create-workflow-aspire`, or `create-workflow-python`.

**Review an existing workflow application** (run any combination, in any order):

- `review-workflow-determinism` — flags non-deterministic constructs in workflow bodies that would break replay.
- `review-workflow-activity` — flags idempotency, error-handling, and convention issues inside activities.
- `review-workflow-management` — checks the HTTP management surface (start, status, terminate, pause, resume, raise-event, purge) against the canonical shape used by the `create-workflow-*` skills.

All review skills are read-only (`Read`, `Grep`, `Glob` only), emit a structured report defined by `.claude/skills/shared/review-report-format.md`, and use stable rule ids (`DWF-DET-NNN`, `DWF-ACT-NNN`, `DWF-MGT-NNN`).

## Repository prerequisites

All skills require:

- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.17+)

### .NET skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)

### .NET Aspire skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Aspire CLI](https://aspire.dev/get-started/install-cli/)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)

### Python skills

- [Python 3.12+](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [Pyright LSP Plugin](https://claude.com/plugins/pyright-lsp)

## Guidelines for skill files

- Skill files are Markdown documents in `.claude/skills/<skill-name>/SKILL.md`
- Each skill directory should also include a `REFERENCE.md` with full code examples and detailed explanations
- Skill front-matter fields: `name`, `description`, `model` (e.g. `opus`)
- Each skill should include sections for: prerequisite checks, project setup, folder structure, verify, and a final message
- Use `<PlaceholderName>` syntax for values the user should replace (e.g., `<ProjectName>`, `<ProjectNamespace>`)
- Code examples should be complete and runnable, not snippets
- The SKILL.md file should be minimal; detailed code examples belong in `REFERENCE.md`
- Include "Key points" sections after code examples to explain important concepts
- Skills must perform all prerequisite checks before creating any files
- Skills must be able to work on MacOS, Linux, and Windows environments.
- Shared content goes in `.claude/skills/shared/`; SKILL.md and REFERENCE.md files reference shared files to avoid duplication.
