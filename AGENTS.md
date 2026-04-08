# AGENTS.md

This repository contains skill definitions for building Dapr Workflow applications. The skills follow the [Agent Skills specification](https://agentskills.io/home) and can be used with any compatible AI coding assistant.

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

## Usage

Follow a two-step workflow when building Dapr Workflow applications:

1. **Check prerequisites** — Run the appropriate `check-prereq-xxx` skill first to verify your environment (e.g., `check-prereq-dotnet`, `check-prereq-aspire`, or `check-prereq-python`).
2. **Create the workflow** — Once the prerequisites pass, run the corresponding skill to scaffold the project: `create-workflow-dotnet`, `create-workflow-aspire`, or `create-workflow-python`.

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

- [Python 3.12+](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- Python language server support (for code diagnostics)

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
