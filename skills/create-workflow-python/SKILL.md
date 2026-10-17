---
name: create-workflow-python
description: Creates a Dapr workflow app in Python, run locally with dapr run. Use for "create a workflow in Python" or "build a workflow app in Python". For Diagrid Catalyst use the catalyst-ai plugin.
allowed-tools:
  - Write
  - Edit
  - Bash(diagrid-dev-dashboard --version)
  - Bash(uv venv)
  - Bash(uv sync)
  - Bash(uv run python -m compileall -q -x .venv .)
  - Bash(uv run python -c "import pathlib, shutil; [shutil.rmtree(p) for p in pathlib.Path('.').rglob('__pycache__') if '.venv' not in p.parts]")
---

# Create Dapr Workflow Python Application

## Overview

This skill describes how to create a Dapr Workflow application using Python.

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
4. What's the name of this project? This will be used as the folder name. Don't use any spaces in this name.

### Resolving the names

Before creating any file, write out the resolved names and restate them to the user in two or three lines,
so a wrong reading is caught before it is scaffolded. Resolve them exactly as
[`../dapr-shared/workflow-placeholders.md`](../dapr-shared/workflow-placeholders.md) defines them:
`<WorkflowName>` from the purpose, `<WorkflowInput>` and `<WorkflowOutput>` from its stem, and one
`<ActivityName>` per step with its `<ActivityInput>` and `<ActivityOutput>`.

## Prerequisites

The following must be installed by the user before this skill can run:

- [Python 3.12+](https://www.python.org/downloads/) (`uv venv` uses the newest interpreter it finds; pin one with `uv venv --python 3.12` when you need a specific version)
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Astral)
- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/)

Additional runtime dependencies (handled during project setup):

- Python package: `dapr-ext-workflow` version `1.18.0` (pulls in `dapr` 1.18.0)
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) for inspecting workflow runs locally. The skill only checks whether it is installed (see `## Check optional tools`); it never installs it and never stops without it.

## Check optional tools

Check once whether the optional [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) is installed by following the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`). Remember the result (`DevDashboardInstalled`) for the final message. This check never stops the skill: do not ask the user about it, do not install anything, and continue with the next step whether or not the dashboard is installed.

## Project Setup

Create the project root folder inside the current location where the terminal is open:

```shell
mkdir <ProjectRoot>
cd <ProjectRoot>
```

The <ProjectName> should start with the <ProjectRoot> and end with `-app`: <ProjectRoot>-app.

### Folder structure

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── resources/
│   └── statestore.yaml
└── <ProjectName>/
    ├── pyproject.toml
    ├── main.py
    ├── models.py
    ├── runtime.py
    ├── workflow.py
    └── activities.py
```

### .gitignore

Python style `.gitignore` file in the project root. See `REFERENCE.md` for full example.

### dapr.yaml

Multi-app run file in the project root. Configures the Dapr sidecar and points to the resources folder. See `REFERENCE.md` for full example and key points.

### resources/statestore.yaml

Dapr Workflow requires a state store component (with `actorStateStore` set to `"true"`). See `REFERENCE.md` for full example and key points.

### pyproject.toml

Python configuration file used by packaging tools. See `REFERENCE.md` for full example.

### main.py

Main entry for the Python workflow application. See `REFERENCE.md` for full example.

### Models

Pydantic types for workflow and activity input/output, placed in a `models.py` file. Models must be serializable since Dapr persists workflow state. As of `dapr-ext-workflow` 1.18, Pydantic models can be passed directly to `schedule_new_workflow`, `call_activity`, and `call_child_workflow` — no manual `model_dump()` is needed. See `REFERENCE.md` for full example and key points.

### Runtime file

The `runtime.py` file creates the shared `WorkflowRuntime` instance (`wfr`). Both `workflow.py` and `activities.py` import `wfr` from this file. This avoids a circular import between `workflow.py` and `activities.py`. See `REFERENCE.md` for full example.

### Workflow file

A workflow is defined using the @wfr.workflow(name="<NAME>") attribute. The workflow code is placed in a workflow.py file. It imports `wfr` from `runtime.py`. See `REFERENCE.md` for full example, key points, determinism rules, and workflow patterns (chaining, fan-out/fan-in, sub-workflows).

### Activities file

A workflow activity is defined using the @wfr.activity(name="<NAME>") attribute. The activity code is placed in an `activities.py` file. It imports `wfr` from `runtime.py`. See `REFERENCE.md` for full example and key points.

### local.http

HTTP request file for testing the workflow endpoints. Contains a `start` request (POST) to schedule a new workflow instance and a `status` request (GET) to query the workflow state. Uses the `<app-port>` from `dapr.yaml`. The shared template includes a `raise-event` request: use the event name the workflow waits for, and remove the request when the workflow waits for no external event. See `REFERENCE.md` for full example.

## Verify

**IMPORTANT: After Project Setup you MUST run these exact verification instructions:**

1. Run `uv venv` in the `<ProjectName>` folder to create a virtual environment.
2. Run `uv sync` in the `<ProjectName>` folder to install dependencies.
3. Run `uv run python -m compileall -q -x .venv .` in the `<ProjectName>` folder. The `-x .venv` skips the virtual environment, so only the project code is compiled. It must exit with code 0; fix any error and re-run. A `SyntaxWarning` that comes from a package inside `.venv` (seen with Python 3.14) is harmless.
4. Remove the `__pycache__` folders created by the compile step, on every OS, by running this in the `<ProjectName>` folder: `uv run python -c "import pathlib, shutil; [shutil.rmtree(p) for p in pathlib.Path('.').rglob('__pycache__') if '.venv' not in p.parts]"`.

## Create README.md

**IMPORTANT: After Verify you MUST run these instructions:**

Create a README.md file inside the <ProjectRoot> folder.

The README contains the following sections:
1. Summary of what this folder contains.
2. Architecture description that explains the technology stack and prerequisites to run it locally. **DO NOT suggest to run Redis separately since it's part of the Dapr installation and is running in a container already.**
3. A mermaid diagram that explains the workflow.
4. How to start the application using the Dapr CLI.
5. List the available endpoints in the main.py file and provide examples how to call these using curl. Also include a link to the `local.http` file.
6. The **Diagrid Dapr Dev Dashboard** section, copied from the **README section** of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md): why it is useful, the install command for each OS (macOS / Linux and Windows) and the run command (`diagrid-dev-dashboard`, http://localhost:9090).
7. How to run the application with Diagrid Catalyst to visually inspect the workflow.
8. Next steps: run the `review-workflow-determinism`, `review-workflow-activity` and `review-workflow-management` skills to audit the generated code.

See `REFERENCE.md` for additional instructions on running locally and running with Catalyst.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below followed by the Dev Dashboard recommendation — no preamble, no summary, no additional commentary, only replace the <ProjectRoot> with the actual value:**

The <ProjectRoot> workflow application is created. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled` (installed → start it; not installed → install it). Use it as written, including the link and the commands. Nothing may follow it.
