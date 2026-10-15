---
name: create-workflow-dotnet
description: This skill creates a Dapr workflow application in .NET that runs locally with the Dapr CLI (`dapr run`). Use this skill when the user asks to "create a workflow in .NET", "write a .NET workflow application" or "build a workflow app in C#". For a workflow that runs on Diagrid Catalyst, use the catalyst-ai plugin instead.
allowed-tools:
  - Write
  - Edit
  - Bash(dotnet:*)
  - Bash(dapr:*)
  - mcp__ide__getDiagnostics
  - Bash(diagrid-dev-dashboard --version)
---

# Create Dapr Workflow .NET Application

## Overview

This skill describes how to create a Dapr Workflow application using .NET.

## Execution Order

You MUST follow these phases in strict order:
1. **Check specification** - Check if the user specified what needs to be built.
2. **Check optional tools** — Check whether the Diagrid Dapr Dev Dashboard is installed and remember the result. Never stop, ask or install for this.
3. **Project Setup** — Create all files and folders.
4. **Verify** — Verify that the project builds.
5. **Create README.md** — Create a readme that summarizes what is built and how to run & test the application. Do not provide instructions at the end of this phase.
6. **Show final message** - Your LAST output MUST be EXACTLY the message defined in the `## Show final message` section: the closing sentence followed by the Dev Dashboard recommendation. Do NOT add any other text, summary, or commentary.

## Prerequisites

The following must be installed by the user before this skill can run:

- [.NET 10 SDK](https://dotnet.microsoft.com/en-us/download)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)

Additional runtime dependencies (handled during project setup):

- NuGet package: `Dapr.Workflow` version `1.18.10`
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) for inspecting workflow runs locally. The skill only checks whether it is installed (see `## Check optional tools`); it never installs it and never stops without it.

## Check optional tools

Check once whether the optional [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) is installed by following the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`). Remember the result (`DevDashboardInstalled`) for the final message. This check never stops the skill: do not ask the user about it, do not install anything, and continue with the next step whether or not the dashboard is installed.

## Check specification

If you don't have enough context what to build, ask the user the following clarifying questions one by one using an interview style:

1. What is the purpose of the workflow application?
2. Describe how workflow should work. Which patterns should be used?
3. Specify the input and output objects of the workflow.
4. What's the name of this project? This will be used as the folder name and solution name. Don't use any spaces in this name.

### Resolving the names

Before creating any file, write out the resolved names and restate them to the user in two or three lines,
so a wrong reading is caught before it is scaffolded. Resolve them exactly as
[`../dapr-shared/workflow-placeholders.md`](../dapr-shared/workflow-placeholders.md) defines them:
`<WorkflowName>` from the purpose, `<WorkflowInput>` and `<WorkflowOutput>` from its stem, and one
`<ActivityName>` per step with its `<ActivityInput>` and `<ActivityOutput>`.


## Project Setup

Create the project root folder inside the current location where the terminal is open, then create a new ASP.NET Core web application inside it:

```shell
mkdir <ProjectRoot>
cd <ProjectRoot>
dotnet new web -n <ProjectName>
dotnet add <ProjectName> package Dapr.Workflow --version 1.18.10
```

The <ProjectName> should start with the <ProjectRoot> and end with `App`: <ProjectRoot>App.

### Folder structure

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── resources/
│   └── statestore.yaml
└── <ProjectName>/
    ├── <ProjectName>.csproj
    ├── Program.cs
    ├── Properties/
    │   └── launchSettings.json
    ├── Models/
    │   └── <ModelName>.cs
    ├── Workflows/
    │   └── <WorkflowName>.cs
    └── Activities/
        └── <ActivityName>.cs
```

### .gitignore

Visual Studio style `.gitignore` file in the project root. Ignores build output (`bin`, `obj`), debug/release folders, and other common .NET artifacts. See `REFERENCE.md` for full example.

### dapr.yaml

Multi-app run file in the project root. Configures the Dapr sidecar and points to the resources folder. See `REFERENCE.md` for full example and key points.

### resources/statestore.yaml

Dapr Workflow requires a state store component (with `actorStateStore` set to `"true"`). See `REFERENCE.md` for full example and key points.

### Properties/launchSettings.json

Configures the application port, which must match `appPort` in `dapr.yaml`. See `REFERENCE.md` for full example.

### .csproj

Standard ASP.NET Core web project targeting `net10.0` with the `Dapr.Workflow` package. See `REFERENCE.md` for full example.

### Models

Record types for workflow and activity input/output, placed in a `Models` folder. Must be serializable since Dapr persists workflow state. See `REFERENCE.md` for full example and key points.

### Program.cs

Uses `AddDaprWorkflow()` to register the Dapr Workflow runtime (workflows and activities are auto-registered). Uses `DaprWorkflowClient` to schedule workflow instances and query status via HTTP endpoints. See `REFERENCE.md` for full example and key points.

### Workflow Class

Inherits from `Workflow<TInput, TOutput>`, overrides `RunAsync`, and orchestrates activities via `context.CallActivityAsync`. Must be `internal sealed partial` (`partial` is required for `[LoggerMessage]` methods). Place in a `Workflows` folder and the `<ProjectNamespace>.Workflows` namespace. See `REFERENCE.md` for full example, key points, determinism rules, and workflow patterns (chaining, fan-out/fan-in, sub-workflows).

### Activity Class

Inherits from `WorkflowActivity<TInput, TOutput>`, overrides `RunAsync`, and contains the actual business logic. Must be `internal sealed partial` (`partial` is required for `[LoggerMessage]` methods). Place in an `Activities` folder and the `<ProjectNamespace>.Activities` namespace. See `REFERENCE.md` for full example and key points.

### local.http

HTTP request file for testing the workflow endpoints. Contains a `start` request (POST) to schedule a new workflow instance and a `status` request (GET) to query the workflow state. Uses the `<app-port>` from `launchSettings.json`. See `REFERENCE.md` for full example.

## Verify

**IMPORTANT: After Project Setup you MUST run these checks:**

1. Run `dotnet build` on the `.csproj` file. It must succeed; fix any errors and rebuild until it does. Never report the project as created while the build fails.
2. When `mcp__ide__getDiagnostics` is available, check the new files with it as well.
3. Tell the user how to start the app: `dapr run -f .` in the project root.

## Create README.md

**IMPORTANT: After Verify you MUST run these instructions:**

Create a README.md file inside the <ProjectRoot> folder.

The README contains the following sections:
1. Summary of what this folder contains.
2. Architecture description that explains the technology stack and prerequisites to run it locally. **DO NOT suggest to run Redis separately since it's part of the Dapr installation and is running in a container already.**
3. A mermaid diagram that explains the workflow.
4. How to start the application using the Dapr CLI.
5. List the available endpoints in the Program.cs file and provide examples how to call these using curl. Also include a link to the `local.http` file.
6. The **Diagrid Dapr Dev Dashboard** section, copied from the **README section** of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md): why it is useful, the install command for each OS (macOS / Linux and Windows) and the run command (`diagrid-dev-dashboard`, http://localhost:9090).
7. How to run the application with Diagrid Catalyst to visually inspect the workflow.
8. Next steps: run the `review-workflow-determinism`, `review-workflow-activity` and `review-workflow-management` skills to audit the generated code.

See `REFERENCE.md` for additional instructions on running locally and running with Catalyst.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below followed by the Dev Dashboard recommendation — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> workflow application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled` (installed → start it; not installed → install it). Use it as written, including the link and the commands. Nothing may follow it.
