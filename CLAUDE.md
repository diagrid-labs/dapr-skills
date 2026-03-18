# CLAUDE.md

This repository contains Claude Code skill definitions for building Dapr Workflow applications.

## Repository structure

- `.claude/skills/` — Skill files organized by language/framework
  - `shared/` — Shared content referenced by multiple skills (prereq checks, common .NET sections, running instructions)
  - `create-workflow-dotnet/SKILL.md` — Skill for creating Dapr Workflow apps with .NET
  - `create-workflow-dotnet/REFERENCE.md` — Detailed reference examples for the .NET skill
  - `create-workflow-python/SKILL.md` — Skill for creating Dapr Workflow apps with Python
  - `create-workflow-python/REFERENCE.md` — Detailed reference examples for the Python skill
  - `create-workflow-aspire/SKILL.md` — Skill for creating Dapr Workflow apps with Aspire
  - `create-workflow-aspire/REFERENCE.md` — Detailed reference examples for the Aspire skill

## Repository prerequisites

The following tools must be installed to use any skill in this repo:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.17+)

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
