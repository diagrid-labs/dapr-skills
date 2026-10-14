---
name: create-workflow-aspire
description: This skill creates a Dapr workflow application with .NET Aspire that runs locally through the Aspire AppHost. Use this skill when the user asks to "create a workflow with Aspire", "write an Aspire workflow application" or "build a workflow app with .NET Aspire". For a workflow that runs on Diagrid Catalyst, use the catalyst-ai plugin instead.
allowed-tools:
  - Bash(dotnet:*)
  - Bash(aspire new:*)
  - Bash(~/.aspire/bin/aspire new:*)
  - mcp__ide__getDiagnostics
  - Bash(diagrid-dev-dashboard --version)
---

# Create Dapr Workflow .NET Aspire Application

## Overview

This skill describes how to create a Dapr Workflow application using Aspire. The generated solution uses Aspire to orchestrate the Dapr sidecar, a Valkey state store (container resource), and the locally installed Diagrid Dapr Dev Dashboard (executable resource).

## Execution Order

You MUST follow these phases in strict order:
1. **Check specification** - Check if the user specified what needs to be built.
2. **Check optional tools** — Check whether the Diagrid Dapr Dev Dashboard is installed and remember the result. Never stop, ask or install for this.
3. **Project Setup** — Create all files and folders.
4. **Verify** — Verify that the project builds.
5. **Create README.md** — Create a readme that summarizes what is built and how to run & test the application. Do not provide instructions at the end of this phase.
6. **Show final message** - Your LAST output MUST be EXACTLY the message defined in the `## Show final message` section: the closing sentence followed by the Dev Dashboard recommendation. Do NOT add any other text, summary, or commentary.

## Check specification

If you don't have enough context what to build, ask the user the following clarifying questions one by one using an interview style:

1. What is the purpose of the workflow application?
2. Describe how workflow should work. Which patterns should be used?
3. Specify the input and output objects of the workflow.
4. What's the name of this project? This will be used as the folder name and solution name. Don't use any spaces in this name.

## Prerequisites

The following must be installed by the user before this skill can run:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Aspire CLI](https://aspire.dev/get-started/install-cli/) — install via `curl -sSL https://aspire.dev/install.sh | bash` or `irm https://aspire.dev/install.ps1 | iex`
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)

Additional runtime dependencies (handled during project setup):

- NuGet package: `Dapr.Workflow` version `1.18.10` (ApiService)
- NuGet package: `CommunityToolkit.Aspire.Hosting.Dapr` version `13.0.0` (AppHost)
- NuGet package: `Aspire.Hosting.Valkey` version `<AspireVersion>` (AppHost) — the same version as the `Aspire.AppHost.Sdk` that `aspire new` writes
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) for inspecting workflow runs locally. The skill only checks whether it is installed (see `## Check optional tools`); it never installs it and never stops without it.

## Check optional tools

Check once whether the optional [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) is installed by following the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`). Remember the result (`DevDashboardInstalled`) for the final message. This check never stops the skill: do not ask the user about it, do not install anything, and continue with the next step whether or not the dashboard is installed.

## Project Setup

Scaffold the solution using the Aspire CLI inside the current location where the terminal is open, then customize it for Dapr Workflow.

**IMPORTANT: Always include `--non-interactive`, `--test-framework none`, and `--suppress-agent-init` in the `aspire new` command below.**

- Omitting `--non-interactive` or `--test-framework none` causes the command to block waiting for user input, which breaks skill execution.
- Omitting `--suppress-agent-init` makes the Aspire CLI configure AI agent environments after scaffolding: it installs Aspire skills and telemetry hooks into the user's global AI tool configuration (e.g. `~/.claude/settings.json`, `~/.copilot/hooks/`, `~/.agents/skills/`) and adds an `.agents/` folder to the solution. The skill must not change the user's global configuration.

```shell
aspire new aspire-starter -n <SolutionRoot> -o <SolutionRoot> --non-interactive --test-framework none --suppress-agent-init
```

After scaffolding:

1. **Remove the Web project** — The generated `<SolutionRoot>.Web` project is not needed. Delete the `<SolutionRoot>.Web` folder and remove its project reference from `<SolutionRoot>.AppHost.csproj` and the `.sln` file.
2. **Determine `<AspireVersion>`** — read the `Sdk` attribute of the generated `<SolutionRoot>.AppHost/<SolutionRoot>.AppHost.csproj` (e.g. `<Project Sdk="Aspire.AppHost.Sdk/13.6.1">` → `13.6.1`). Keep the Aspire versions that `aspire new` writes: do NOT change the `Aspire.AppHost.Sdk` version or the package versions in the scaffolded ServiceDefaults project.
3. **Add NuGet packages** — run these commands from **inside the `<SolutionRoot>` folder** (do NOT `cd` elsewhere between commands, as the working directory persists across Bash calls and will break subsequent file operations that use relative paths):
   ```shell
   dotnet add <SolutionRoot>.ApiService/<SolutionRoot>.ApiService.csproj package Dapr.Workflow --version 1.18.10
   dotnet add <SolutionRoot>.AppHost/<SolutionRoot>.AppHost.csproj package CommunityToolkit.Aspire.Hosting.Dapr --version 13.0.0
   dotnet add <SolutionRoot>.AppHost/<SolutionRoot>.AppHost.csproj package Aspire.Hosting.Valkey --version <AspireVersion>
   ```
4. **Create/update source files** — Create all files described below, using `REFERENCE.md` for complete code.

### Folder structure

```
<SolutionRoot>/
├── aspire.config.json
├── .gitignore
├── <SolutionRoot>.sln
├── <SolutionRoot>.ApiService/
│   ├── <SolutionRoot>.ApiService.csproj
│   ├── <SolutionRoot>.ApiService.http
│   ├── Program.cs
│   ├── appsettings.json
│   ├── appsettings.Development.json
│   ├── Properties/
│   │   └── launchSettings.json
│   ├── Models/
│   │   └── <ModelName>.cs
│   ├── Workflows/
│   │   └── <WorkflowName>.cs
│   └── Activities/
│       └── <ActivityName>.cs
├── <SolutionRoot>.AppHost/
│   ├── <SolutionRoot>.AppHost.csproj
│   ├── AppHost.cs
│   ├── appsettings.json
│   ├── appsettings.Development.json
│   ├── Properties/
│   │   └── launchSettings.json
│   └── Resources/
│       └── statestore.yaml
└── <SolutionRoot>.ServiceDefaults/
    ├── <SolutionRoot>.ServiceDefaults.csproj
    └── Extensions.cs
```

### aspire.config.json

Generated by `aspire new` in the solution root. It tells the Aspire CLI which AppHost project to run (`{"appHost":{"path":"<SolutionRoot>.AppHost/<SolutionRoot>.AppHost.csproj"}}`). Keep as scaffolded.

### .gitignore

Visual Studio style `.gitignore` file in the solution root. Ignores build output (`bin`, `obj`), debug/release folders, and other common .NET artifacts. See `REFERENCE.md` for full example.

### AppHost.cs

Configures Dapr via `AddDapr()`, adds a Valkey cache container on port 16379, registers the ApiService project with `WithDaprSidecar()`, and adds the Diagrid Dapr Dev Dashboard as an executable resource (`AddExecutable("dapr-dev-dashboard", "diagrid-dev-dashboard", ...)` on port 9090). See `REFERENCE.md` for full example and key points.

### AppHost .csproj

Uses `Aspire.AppHost.Sdk`, references `CommunityToolkit.Aspire.Hosting.Dapr` and `Aspire.Hosting.Valkey` packages, includes a project reference to ApiService, and copies Resources to output. See `REFERENCE.md` for full example.

### Resources/statestore.yaml

State store component for the apiservice Dapr sidecar. Uses `localhost:16379` to connect to the Valkey container managed by Aspire. See `REFERENCE.md` for full example and key points.

### ApiService Program.cs

Same pattern as the dotnet skill but adds `builder.AddServiceDefaults()` at the start and `app.MapDefaultEndpoints()` before `app.Run()`. Uses `AddDaprWorkflow()` to register the Dapr Workflow runtime (workflows and activities are auto-registered). Uses `DaprWorkflowClient` to schedule workflow instances and query status via HTTP endpoints. Includes start, status, pause, resume, and terminate endpoints. See `REFERENCE.md` for full example and key points.

### ApiService .csproj

Standard ASP.NET Core web project targeting `net10.0` with the `Dapr.Workflow` package and a project reference to ServiceDefaults. See `REFERENCE.md` for full example.

### Models

Record types for workflow and activity input/output, placed in a `Models` folder. Must be serializable since Dapr persists workflow state. See `REFERENCE.md` for full example and key points.

### Workflow Class

Inherits from `Workflow<TInput, TOutput>`, overrides `RunAsync`, and orchestrates activities via `context.CallActivityAsync`. Must be `internal sealed partial` (`partial` is required for `[LoggerMessage]` methods). Place in a `Workflows` folder and the `<ProjectNamespace>.Workflows` namespace. See `REFERENCE.md` for full example, key points, determinism rules, and workflow patterns (chaining, fan-out/fan-in, sub-workflows).

### Activity Class

Inherits from `WorkflowActivity<TInput, TOutput>`, overrides `RunAsync`, and contains the actual business logic. Must be `internal sealed partial` (`partial` is required for `[LoggerMessage]` methods). Place in an `Activities` folder and the `<ProjectNamespace>.Activities` namespace. See `REFERENCE.md` for full example and key points.

### ServiceDefaults Extensions.cs

Template-generated file that adds OpenTelemetry, health checks, service discovery, and resilience. No modifications needed — keep as scaffolded by `aspire new`. See `REFERENCE.md` for reference.

### <SolutionRoot>.ApiService.http

HTTP request file for testing the workflow endpoints: `start`, `status`, `pause`, `resume`, `terminate`, and `raise-event` (only when a workflow waits for an external event), matching the endpoints in the ApiService `Program.cs`. Reuse [`../dapr-shared/dotnet-local-http.md`](../dapr-shared/dotnet-local-http.md) with the ApiService `launchSettings.json` port. See `REFERENCE.md` for the Aspire-specific key points.

## Verify

**IMPORTANT: After Project Setup you MUST show these exact verification instructions:**

1. Run `dotnet build` on the `.sln` file to check for build errors.
2. Instruct the user to start the application with `aspire run` in the solution root to start the Aspire-orchestrated workflow app.

## Create README.md

**IMPORTANT: After Verify you MUST run these instructions:**

Create a README.md file inside the `<SolutionRoot>` folder.

The README contains the following sections:
1. Summary of what this folder contains.
2. Architecture description that explains the technology stack (Aspire, Dapr Workflow, Valkey, ServiceDefaults) and prerequisites to run it locally. **DO NOT suggest to run Redis or Valkey separately since Aspire manages it as a container resource.**
3. A mermaid diagram that explains the workflow.
4. How to start the application using `aspire run`.
5. List the available endpoints in the ApiService `Program.cs` file and provide examples how to call these using curl. Also include a link to the `<SolutionRoot>.ApiService/<SolutionRoot>.ApiService.http` file.
6. The **Diagrid Dapr Dev Dashboard** section from the **README section** of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md), in its Aspire form: why it is useful, the install command for each OS (macOS / Linux and Windows), that `aspire run` starts it as the `dapr-dev-dashboard` resource (http://localhost:9090), and that only that resource fails when it is not installed.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below followed by the Dev Dashboard recommendation — no preamble, no summary, no additional commentary, only replace the <SolutionRoot> with the actual value:**

The <SolutionRoot> workflow application is created. Open the README.md file in the <SolutionRoot> folder for a summary and instructions for running locally.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled` (installed → start it; not installed → install it), in its Aspire form (`aspire run` starts it as the `dapr-dev-dashboard` resource). Use it as written, including the link and the commands. Nothing may follow it.
