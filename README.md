# Dapr Workflow & Agent Skills

This repository contains skill definitions that can be used with Claude Code, GitHub Copilot CLI, and OpenAI Codex CLI to build Dapr Workflow applications and durable AI agent applications that run on Dapr Workflow.

### Workflow skills

- Text-spec skills: `create-workflow-dotnet`, `create-workflow-aspire`, `create-workflow-python` — describe the workflow in natural language and scaffold a runnable project.
- Building-blocks skill: `create-workflow-typescript` — scaffolds a TypeScript Dapr Workflow whose activities also exercise service invocation, pub/sub, bindings, jobs, state, and secrets, plus a small second service invoked over service invocation.
- Diagram-input skill: `create-workflow-from-diagram` — provide a workflow diagram (PNG / JPG / JPEG / GIF / WebP) or a BPMN 2.0 XML file; the skill extracts structure and generates code for Go, Python, .NET, Java, or JavaScript.
- Migration skill: `migrate-workflow-typescript` — analyzes an **existing** TypeScript/Node.js application (not a scaffold), proposes a Dapr building-block mapping for approval, and applies confirmed changes incrementally with verification between each.
- Review skills: `review-workflow-determinism`, `review-workflow-activity`, `review-workflow-management` — audit an existing project.

### Agent skills

- Text-spec skills: `create-agent-python`, `create-agent-dotnet` — scaffold a durable agent app. Python covers the [`dapr-agents`](https://github.com/dapr/dapr-agents) SDK and the [`diagrid`](https://pypi.org/project/diagrid/) framework wrappers; .NET covers [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/) on Dapr Workflow via [`Diagrid.AI.Microsoft.AgentFramework`](https://www.nuget.org/packages/Diagrid.AI.Microsoft.AgentFramework).
- Review skills: `review-agent-tools`, `review-agent-memory`, `review-agent-orchestration`, `review-agent-observability` — audit tools, memory/state config, multi-agent pub/sub wiring, and tracing/metrics on an existing agent project.

## Prerequisites

- One of: [Claude Code](https://claude.com/product/claude-code), [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli), or [OpenAI Codex CLI](https://developers.openai.com/codex/cli)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)

### For .NET skills

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [C# LSP Plugin](https://claude.com/plugins/csharp-lsp)

### For Python skills

- Python 3.12+ for workflow skills, Python 3.11–3.13 for agent skills — [download Python](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

### For TypeScript skills

- [Node.js 22+ (LTS)](https://nodejs.org/en/download)

### For agent skills

- At least one LLM provider: an `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` environment variable, or a local [Ollama](https://ollama.com/) instance on `http://localhost:11434`.

## Installation

The skills are distributed from [diagrid-labs/dapr-skills](https://github.com/diagrid-labs/dapr-skills). They are written for Claude Code and work best there; other agents ignore Claude-specific front-matter such as `allowed-tools` and `model`.

> **Install all skills together.** Skills read shared files from the `dapr-shared` support skill (`../dapr-shared/...`), and some review skills read the REFERENCE files of the matching create skills. Every install method below installs the full set by default.

### Claude Code

Add this repo as a plugin marketplace and install the `dapr-skills` plugin from within a Claude Code session:

```text
/plugin marketplace add diagrid-labs/dapr-skills
/plugin install dapr-skills@diagrid-labs
```

Alternatively, run `/plugin` and use the interactive UI to browse and install the plugin. To update or remove the plugin later, use `/plugin` and select the corresponding action.

### GitHub Copilot CLI

Copilot CLI reads the Claude plugin marketplace in this repo. From a terminal:

```shell
copilot plugin marketplace add diagrid-labs/dapr-skills
copilot plugin install dapr-skills@diagrid-labs
```

Start a new `copilot` session (or run `/skills reload` in an active one) and check that the skills are loaded with `/skills`. Update with `copilot plugin update dapr-skills` and remove with `copilot plugin uninstall dapr-skills`.

### OpenAI Codex CLI

Use the `skills` CLI (see [Any agent](#any-agent-npx-skills) below) with the Codex agent:

```shell
npx skills add diagrid-labs/dapr-skills --skill "*" -a codex
```

This installs to `.agents/skills/` (add `-g` for `~/.agents/skills/`), the folders Codex loads skills from. Restart Codex so it picks up the new skills. Copying the repository's `skills/` folder (including `dapr-shared`) into one of those folders by hand also works.

> GitHub Copilot CLI also reads `.agents/skills` and `~/.agents/skills`. If you use Copilot CLI together with Codex or `npx skills -a github-copilot`, install the skills only once to avoid loading duplicate skills in Copilot CLI.

### Any agent (`npx skills`)

The [`skills` CLI](https://github.com/vercel-labs/skills) installs the skills into Claude Code, Codex, GitHub Copilot, Cursor, and other agents. It requires Node.js.

```shell
# Install all skills; the CLI asks which agents to install to
npx skills add diagrid-labs/dapr-skills --skill "*"

# Non-interactive, user-wide, for specific agents
npx skills add diagrid-labs/dapr-skills --skill "*" -a claude-code -a codex -a github-copilot -g -y

# Update
npx skills update
```

To remove the skills, run `npx skills remove` and select the Dapr skills in the interactive list, or remove them by name (add `-g` if you installed them with `-g`):

```shell
npx skills remove check-prereq-agent-dotnet check-prereq-agent-python check-prereq-aspire check-prereq-dotnet check-prereq-python create-agent-dotnet create-agent-python create-workflow-aspire create-workflow-dotnet create-workflow-from-diagram create-workflow-python create-workflow-typescript dapr-shared migrate-workflow-typescript review-agent-memory review-agent-observability review-agent-orchestration review-agent-tools review-workflow-activity review-workflow-determinism review-workflow-management -y
```

Do not use `npx skills remove --skill "*"`: it removes **every** installed skill, including skills from other sources.

Project installs go to `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex, Copilot, and others); add `-g` for a user-wide install. The `skills` CLI sends anonymous usage telemetry; set `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1` to turn it off.

If you install only some skills (`--skill <name>`), also install their dependencies:

| Installing… | Also install |
| --- | --- |
| any skill | `dapr-shared` |
| `review-workflow-activity`, `review-workflow-determinism` | `create-workflow-python` |
| `review-workflow-management` | `create-workflow-dotnet`, `create-workflow-python` |
| `review-agent-memory`, `review-agent-observability`, `review-agent-orchestration`, `review-agent-tools` | `create-agent-dotnet`, `create-agent-python` |
| `migrate-workflow-typescript` | `create-workflow-typescript` |

`node scripts/validate-skills.mjs` prints the current dependency list; update this table when it changes.

## How to use this

1. Start your agent (Claude Code, Copilot CLI, or Codex) in the directory where you want the generated project to be created.
2. Make sure the skills are installed (see [Installation](#installation)).
3. OPTIONAL: Run a `check-prereq-<language>` skill to verify your environment (e.g., "check prerequisites for .NET", "check prerequisites for Aspire", "check prerequisites for Python", or "check prerequisites for Python agents"). Follow the instructions if the prerequisites are not met.
4. Run a `create-workflow-<language>` or `create-agent-<language>` skill to scaffold the project (see the prompt examples below).
5. Depending on your access permissions, you may need to approve the usage of some tools during project generation.
6. Inspect the `README.md` file in the new folder after the project is created.

## Available skills

Invoke a skill by asking your agent in natural language — the example phrases below trigger each skill.

### Prerequisite checks

| Skill | Example prompt |
| --- | --- |
| `check-prereq-dotnet` | "check prerequisites for .NET" |
| `check-prereq-aspire` | "check prerequisites for Aspire" |
| `check-prereq-python` | "check prerequisites for Python" |
| `check-prereq-agent-python` | "check prerequisites for Python agents" |
| `check-prereq-agent-dotnet` | "check prerequisites for .NET agents" |

### Create a workflow

| Skill | Example prompt |
| --- | --- |
| `create-workflow-dotnet` | "create a workflow in .NET named ..." |
| `create-workflow-aspire` | "create a workflow with Aspire named ..." |
| `create-workflow-python` | "create a workflow in Python named ..." |
| `create-workflow-typescript` | "create a Dapr building blocks app in TypeScript named ..." |
| `create-workflow-from-diagram` | "create a Dapr workflow in `<language>` from this diagram" (attach a PNG/JPG/GIF/WebP image or a `.bpmn` file; supported output languages: Go, Python, .NET, Java, JavaScript) |

### Migrate an existing application

| Skill | Example prompt |
| --- | --- |
| `migrate-workflow-typescript` | "migrate this app to Dapr", "add Dapr to my existing Node.js app" |

### Review an existing workflow

| Skill | Example prompt |
| --- | --- |
| `review-workflow-determinism` | "review workflow for determinism" |
| `review-workflow-activity` | "review workflow activities" |
| `review-workflow-management` | "review workflow management endpoints" |

### Create an agent

| Skill | Example prompt |
| --- | --- |
| `create-agent-python` | "create an agent in Python named ..." |
| `create-agent-dotnet` | "create an agent in .NET named ..." |

### Review an existing agent

| Skill | Example prompt |
| --- | --- |
| `review-agent-tools` | "review the agent tools in this repo" |
| `review-agent-memory` | "review this agent's memory and state store configuration" |
| `review-agent-orchestration` | "review this multi-agent project's orchestration" |
| `review-agent-observability` | "audit the observability of my dapr-agents project" |

## Prompt examples

### Example 1: .NET Aspire Onboarding process

Create a Dapr workflow app in .NET with Aspire named EmployeeOnboarding. The workflow automates the onboarding process of a new employee. The first activity is employee registration, which creates a new employeeId in a data store. Then 4 activities are called in parallel:

  1. AddEmployeeToInternalCommsTool
  2. AddEmployeeToBenefitsProgram
  3. UpdateOrgChart
  4. SendWelcomePackage

The input for the workflow contains the following fields:

- First name
- Last name
- Address
- Department

The input records for the 4 parallel activities include the employeeId. The workflow output should include the employeeId.

### Example 2: .NET StarTrek Enterprise Diagnostics

Create a .NET Workflow application named EnterpriseDiagnostics that performs a diagnostics scan for the spaceship Enterprise from Star Trek. The diagnostics start with parallel activities for analyzing the hull, analyzing the warp core, ship security protocols, and weapon systems. Once all these analyses are done, data is combined and a call is made that returns recommendations and priorities. The final activity should be a notification to the bridge with the results.

The input for the workflow contains the following fields:

- Ship name
- Date of diagnostics request
- Name of the engineer who requested the diagnostic

Use mock inputs and outputs for the activities.

### Example 3: Python Order Processing

Create a Dapr workflow app in Python named order_processing. The workflow processes an order. The first activity validates the order. Then 2 activities run in parallel:

  1. ReserveInventory
  2. ProcessPayment

Once both complete, a final activity sends an order confirmation.

The input for the workflow contains the following fields:

- Order ID
- Customer name
- Items (list)
- Total amount

### Example 4: Python StarTrek Enterprise Diagnostics

Create a Python Workflow application named enterprise_diagnostics that performs a diagnostics scan for the spaceship Enterprise from Star Trek. The diagnostics start with parallel activities for analyzing the hull, analyzing the warp core, ship security protocols, and weapon systems. Once all these analyses are done, data is combined and a call is made that returns recommendations and priorities. The final activity should be a notification to the bridge with the results.

The input for the workflow contains the following fields:

- Ship name
- Date of diagnostics request
- Name of the engineer who requested the diagnostic

### Example 5: Generate a Dapr workflow from a diagram

Drop a workflow diagram or BPMN file into the chat and ask Claude Code to scaffold a Dapr workflow app from it:

> Create a Dapr workflow in Python from this diagram. *(attach `skills/create-workflow-from-diagram/examples/user-order.png`)*

> Scaffold a Go Dapr workflow from this BPMN file. *(attach `skills/create-workflow-from-diagram/examples/order-process.bpmn`)*

The skill extracts the workflow structure into an intermediate representation, validates it, and writes a runnable project in the chosen language. See `skills/create-workflow-from-diagram/REFERENCE.md` for the IR format and per-language notes.

`skills/create-workflow-from-diagram/examples/pizza-order.png` is intentionally *not* a clean diagram: its 60-minute timer branch has no outgoing flow and "call pizza delivery service" has no incoming flow. Use it to see the ambiguity path. The skill flags the gap and asks you how the flows connect instead of guessing, and generates no code until that's resolved.

### Example 6: Python agent with the `dapr-agents` SDK

Create an agent in Python named weather_agent using the native dapr-agents SDK. The agent answers weather questions for a city and uses a get_weather tool that returns temperature and conditions. Route the LLM through a Dapr conversation component backed by OpenAI. Include observability.

### Example 7: Multi-agent orchestrator in Python

Create a multi-agent orchestrator in Python named event_planner. The coordinator and three specialists (venue_scout, catering_coordinator, decoration_planner) all use the native dapr-agents SDK. Each specialist runs as its own Dapr app and registers in the shared `agent-registry` state store; the coordinator finds them there and calls each one as a child workflow, then broadcasts the final plan on `agents.broadcast`.

### Example 8: .NET agent with Microsoft Agent Framework

Create an agent in .NET named SupportAgent using Microsoft Agent Framework on Dapr Workflow. The agent answers customer support questions and uses a LookupOrder tool that takes an order ID and returns the order status. Route the LLM through a Dapr conversation component backed by OpenAI.

### Example 9: Review an existing agent project

> Review the agent tools in this repo

> Check the memory and state store configuration of this agent project

> Audit the observability of my dapr-agents project

### Example 10: TypeScript Dapr building blocks tour

Create a Dapr building blocks app in TypeScript named OrderFlow. Use the default Order Processing reference scenario: an order is priced by a separate pricing-service over service invocation, saved to state, paid for using a secret, and its completion is announced via pub/sub, an output binding, and a scheduled follow-up job.

### Example 11: Migrate an existing Node.js service to Dapr

Migrate this app to Dapr. Start with a read-only assessment report — don't change anything until I approve the plan.
