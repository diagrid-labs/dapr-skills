---
name: add-workflow-dotnet
description: Adds Dapr Workflow to an existing .NET (ASP.NET Core, plain or Aspire) project. Shows a plan for approval, then adds the workflow, activities and management endpoints with targeted edits, building after each. Use for "add a workflow to my .NET project" or "make this process a durable workflow". For a new project use create-workflow-dotnet. For Diagrid Catalyst use the catalyst-ai plugin.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash(diagrid-dev-dashboard --version)
  - Bash(dotnet --version)
  - Bash(dotnet build)
  - Bash(dotnet test)
  - Bash(git status)
---

# Add Dapr Workflow to an existing .NET project

## Overview

This skill adds Dapr Workflow to an ASP.NET Core project that already exists. It changes nothing before the user approves a written plan, edits existing files with the smallest possible change, follows the project's own conventions, builds the solution after every step and runs the existing tests at the end. It never changes git state.

## Execution Order

You MUST follow these phases in strict order:
1. **Resolve target** — read-only inspection of the solution and project.
2. **Check specification** — what the workflow should do.
3. **Check optional tools** — Diagrid Dapr Dev Dashboard check; never stops the skill.
4. **Plan and approval** — show the Add Workflow Plan with its two questions (package updates, starting the workflow from an existing endpoint) and wait for approval.
5. **Apply** — one step at a time, building after each.
6. **Final verification** — build and test the whole solution.
7. **Write the run doc** — `DAPR-WORKFLOW.md` at the solution root.
8. **Show final message** — your output MUST end with EXACTLY the message in `## Show final message` followed by the Dev Dashboard recommendation. No other text after it.

## Prerequisites

The user must have installed:

- .NET SDK 8.0 or later that supports the project's target framework. Check with `dotnet --version`: the SDK major version must be at least the target framework's major version (net8.0 → 8+, net9.0 → 9+, net10.0 → 10+). Do not require SDK 10 for a net8.0 or net9.0 project. If a `global.json` pins an SDK, that SDK must be installed.
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) 1.18+ (not needed to build; needed to run)
- Aspire solutions only: the [Aspire CLI](https://aspire.dev/get-started/install-cli/) to start the solution with `aspire run` (not needed to build)
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard). The skill only checks whether it is installed; it never installs it and never stops without it.

## Phase 1: Resolve target

Read-only. Follow **Detection** in `REFERENCE.md`. Determine and remember:

- The solution file (`*.sln` or `*.slnx`) and the target project. If more than one ASP.NET Core project qualifies, ask which one (one question) and wait.
- Target framework. `net8.0`, `net9.0` and `net10.0` are supported. For anything else (`net6.0`, `net7.0`, .NET Framework), stop now: say that `Dapr.Workflow` 1.18 needs net8.0 or later, suggest upgrading the target framework or creating a separate workflow service with `create-workflow-dotnet`, and change nothing.
- Host type. Only ASP.NET Core (`Microsoft.NET.Sdk.Web`) is supported. Worker Service, console, Azure Functions, Blazor WebAssembly and MAUI projects stop here with the same kind of explanation.
- Hosting mode: **Aspire** when an AppHost project references the target project; otherwise **dapr run**.
- `Program.cs` (top-level) or `Startup.cs`; minimal APIs or controllers; namespace style, nullable, folder layout.
- Package management: `Directory.Packages.props` (Central Package Management) or per-project versions; existing `Dapr.*` packages and versions. Remember every `Dapr.*` package older than 1.18.10 (and, in Aspire mode, an AppHost on Aspire 9.0–9.4) as **newer packages available**.
- Trigger endpoints: existing endpoints that create or accept the thing the workflow is about (for example `POST /orders` for an order workflow, `POST /invoices` for an invoice workflow). Read-only endpoints (`GET`) never qualify, and neither does an endpoint that only accepts or records something related to the workflow's subject (for example `POST /notifications` for a daily-digest workflow, where the workflow is about the user's digest, not the notification). When in doubt, treat the project as having no trigger endpoint. Remember the best match, and whether an existing test calls it over HTTP (`WebApplicationFactory`, `HttpClient`).
- Existing Dapr files: `dapr.yaml`, the resources folder it points to (`resources/` or `components/`), and any component with `actorStateStore: "true"`.
- Test projects and the build/test commands. Run them as exactly `dotnet build` and `dotnet test`, from the folder that holds the solution file, so they match the allowed commands (the same on macOS, Linux and Windows). Only when that folder holds more than one `*.sln`/`*.slnx` file, add the quoted solution path to each command (`dotnet build "<solution-path>"`); the user may then be asked to approve it.
- `git status` (read-only). Remember whether the tree has uncommitted changes.

## Phase 2: Check specification

If the request does not say what the workflow should do, ask, one question at a time: its purpose; the steps and pattern (task chaining, fan-out/fan-in, external event / approval, timer, child workflow); the input and output. Reuse existing domain types as workflow input or output when they fit.

## Phase 3: Check optional tools

Follow the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`) and remember `DevDashboardInstalled`. Do not ask about it, install it or stop because of it.

## Phase 4: Plan and approval

Emit the **Add Workflow Plan** using the template in `REFERENCE.md`. It lists the target, every file to add, every file to edit with a one-line description of the edit, package versions and where they go, ports, what is reused (an existing actor state store, an existing `dapr.yaml`), what is left alone, the baseline test run (default yes), and an uncommitted-changes warning when Phase 1 found one.

The plan ends with a **Questions** section. Ask these before any file is created or changed, each with its default:

1. **Package updates** — only when Phase 1 found newer packages available: list each package with its current and new version (`Dapr.Client` 1.17.9 → 1.18.10, …) and ask whether to update them. Default: **Yes, update.** Mixed `Dapr.*` versions in one app are a common source of runtime errors, which is why updating is the default.
2. **Start from the existing endpoint** — only when Phase 1 found a trigger endpoint: name it (`POST /orders`) and ask whether it should also start the workflow after its existing work succeeds. Default: **Yes.** Exception: when an existing test calls that endpoint over HTTP, the default is **No**, because the call would then need a running Dapr sidecar; say so in the question. When no endpoint qualifies, write "No existing endpoint starts the workflow; use the new start endpoint." instead of asking.

Write the plan's file lists as if every default is accepted, and mark which items depend on a question.

Then ask the user to approve, change or stop. A plan is not consent: change nothing until the user says yes. A plain "yes" accepts the plan with the defaults; the user may answer a question differently in the same reply. When the user's request already says to go ahead without asking, still show the plan with its questions first, then continue with the defaults.

## Phase 5: Apply

If the baseline test run was kept, run `dotnet test` once now and remember which tests failed before any change. If `dotnet test` aborts because the runtime for the test project's target framework is not installed (for example only the .NET 10 runtime is present for a `net8.0` test project: "You must install or update .NET to run this application"), do not work around it silently. Treat the baseline as not run, say so in `DAPR-WORKFLOW.md`, and tell the user they can install the matching runtime or set `DOTNET_ROLL_FORWARD=Major` themselves (`export DOTNET_ROLL_FORWARD=Major` on macOS/Linux, `$env:DOTNET_ROLL_FORWARD = "Major"` in PowerShell). The final verification then runs the same way and reports the same limit.

Apply the approved items in this fixed order, one step at a time:

1. Package reference — `Dapr.Workflow` 1.18.10 (declared with `Edit`, see `REFERENCE.md`), plus the package updates when question 1 was answered yes.
2. Dapr wiring — **dapr run** mode: `dapr.yaml` and the state store component, or reuse of the existing ones; **Aspire** mode: the AppHost edits from **Adding to an existing AppHost** in [`../dapr-shared/dotnet-aspire-dapr-wiring.md`](../dapr-shared/dotnet-aspire-dapr-wiring.md).
3. Models, activities and workflow classes — new files, following [`../dapr-shared/dotnet-models.md`](../dapr-shared/dotnet-models.md), [`../dapr-shared/dotnet-activity-class.md`](../dapr-shared/dotnet-activity-class.md) and [`../dapr-shared/dotnet-workflow-class.md`](../dapr-shared/dotnet-workflow-class.md).
4. Registration — `AddDaprWorkflow()` and `AddDaprWorkflowVersioning()`, together with the `using Dapr.Workflow;` and `using Dapr.Workflow.Versioning;` directives in the same edit (the build fails with CS1061 without them), per **Adding to an existing Program.cs** in [`../dapr-shared/dotnet-workflow-endpoints.md`](../dapr-shared/dotnet-workflow-endpoints.md).
5. Endpoints — the **Minimal API form** or the **Controller form** from the same file, whichever the project already uses. When question 2 was answered yes, also edit the trigger endpoint per **Starting the workflow from an existing endpoint** in the same file.
6. Requests file — append to an existing `.http` file or add `<ProjectName>.workflow.http` ([`../dapr-shared/dotnet-local-http.md`](../dapr-shared/dotnet-local-http.md)).

Rules for every step:

- Edit existing files with `Edit` and the smallest change; never rewrite an existing file with `Write`. Never change files the plan does not list.
- Follow the project's style: namespace form, nullable annotations, primary constructors or not, folder names.
- Never add a second component with `actorStateStore: "true"`; never replace an existing `dapr.yaml` (append an app entry when needed); never add a second `AddDaprWorkflow()`; keep existing `AddDaprClient()` / `AddControllers().AddDapr()` calls.
- Workflow code must be deterministic: no `DateTime.Now`/`UtcNow`, `Guid.NewGuid`, random numbers, I/O, `Task.Delay` or `Thread.Sleep` in workflow classes — use `context.CurrentUtcDateTime`, `context.NewGuid()` and `context.CreateTimer`. Loops are bounded. Secrets never pass through workflow inputs or outputs.
- After each step run `dotnet build`. If it fails, fix that step or undo that step's edits, tell the user what happened, and stop. Never continue past a failing build. Build warnings that were already there before your change (for example `ASPIRE010` or `NU1902` on an Aspire 13 AppHost) are not yours to fix: list them once in `DAPR-WORKFLOW.md` and leave them alone.
- Never run `git` commands other than `git status`.

## Phase 6: Final verification

Run `dotnet build` and, when test projects exist, `dotnet test`. Report failures that also failed in the baseline run as pre-existing. Never edit tests to make them pass. Do not start `dapr run` or `aspire run`.

## Phase 7: Write the run doc

Create `DAPR-WORKFLOW.md` at the solution root using the template in `REFERENCE.md`. Never edit an existing `README.md`.

## Show final message

**IMPORTANT: This is the LAST step. Your output MUST end with the message below followed by the Dev Dashboard recommendation — keep anything before it to one short line (details belong in `DAPR-WORKFLOW.md`). Replace `<ProjectName>` with the target project name:**

Dapr Workflow is added to <ProjectName>. Open DAPR-WORKFLOW.md in the solution root for what changed and how to run it.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled` (in its Aspire form in Aspire mode). Nothing may follow it.
