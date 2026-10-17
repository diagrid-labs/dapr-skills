---
name: create-workflow-from-diagram
description: Creates a Dapr workflow app from a diagram image (PNG, JPG, GIF, WebP) or a BPMN 2.0 file, in Go, Python, .NET, Java or JavaScript, run locally with dapr run. Use for "create a workflow from this diagram" or "scaffold a workflow from this BPMN". For a Mermaid or hand-drawn sketch, or Diagrid Catalyst, use the catalyst-ai plugin.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash(diagrid-dev-dashboard --version)
---

# Create Dapr Workflow from Diagram

## Overview

This skill converts a workflow diagram into a runnable Dapr workflow project. Two input paths are supported:

- **Image** (PNG / JPG / JPEG / GIF / WebP) — uses Claude's vision to extract workflow structure
- **BPMN 2.0 XML** (`.bpmn`, `.bpmn20.xml`) — parses the XML deterministically

Both paths produce the same intermediate representation (IR, JSON Lines) defined in `prompts/ir-schema.md` — records keyed by `__type` (`metadata`, `participant`, `activity`, `gateway`, `start_end_node`, `edge`, …, ending with `result` + `end_of_ir_stream`). Every `prompts/languages/<lang>.md` prompt renders code from that one IR.

## Execution Order

You MUST follow these phases in strict order:

1. **Check specification** — Confirm you have the input diagram + target language. Ask clarifying questions only if missing.
2. **Check optional tools** — Check whether the Diagrid Dapr Dev Dashboard is installed and remember the result. Never stop, ask or install for this.
3. **Phase 0: Detect input type** — Decide between the image path and the BPMN path.
4. **Phase 1: Diagram → IR** — Emit JSON Lines IR per `prompts/ir-schema.md`.
5. **Phase 2: Validate IR** — Check the stream outcome and structure per `prompts/ir-schema.md` (Steps 4–6 and "Consuming the IR"); resolve open questions with the user.
6. **Phase 3: IR → code** — Render the project for the target language using `prompts/languages/<lang>.md`.
7. **Create README.md** — Summarise the generated project + how to run it.
8. **Show final message** — Your LAST output MUST be EXACTLY the message defined in `## Show final message`: the closing sentence followed by the Dev Dashboard recommendation. Do NOT add any other text, summary, or commentary.

## Check specification

You need three things. Ask at most three clarifying questions, interview-style, only for items not already provided:

1. **Input diagram** — a path to a PNG/JPG/JPEG/GIF/WebP image or a `.bpmn` / `.bpmn20.xml` file. If the user pasted the image directly into the chat, use that.
2. **Target language** — one of: `go`, `python`, `csharp`, `javascript`, `java`. Default: `python`.
3. **Project name** — used as the folder name. No spaces. Defaults to a camelCased name derived from the workflow's `<bpmn:process @id>` or image filename.

## Prerequisites

The following must be installed by the user before running the generated project:

- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.18+)
- Optional: the [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) for inspecting workflow runs locally. The skill only checks whether it is installed (see `## Check optional tools`); it never installs it and never stops without it.

Plus the language toolchain for the chosen target. See the matching `../dapr-shared/prereq-check-*.md` for the full list.

The skill **does not auto-install** anything and does not run builds: no `uv sync`, `npm install`, `dotnet restore` / `build`, `go mod tidy` or `mvn`, and no remote downloads (the `.gitignore` is written locally). The generated project's README tells the user what to install and run. These rules override the install and download steps of the `create-workflow-*` conventions this skill reuses.

## Check optional tools

Check once whether the optional [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) is installed by following the **Check** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) (`diagrid-dev-dashboard --version`). Remember the result (`DevDashboardInstalled`) for the final message. This check never stops the skill: do not ask the user about it, do not install anything, and continue with the next step whether or not the dashboard is installed.

## Phase 0: Detect input type

Decide the path:

- File extension `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, or pasted image → **image path**
- File extension `.bpmn`, `.bpmn20.xml`, or XML file containing `http://www.omg.org/spec/BPMN/20100524/MODEL` namespace → **BPMN path**
- Anything else (e.g. Mermaid, PlantUML, free-form flowchart exports, draw.io without BPMN shape library) → stop, tell the user the input type is not supported in v1, suggest they export to BPMN or a standard image

## Phase 1: Diagram → IR

### Image path

1. Load `prompts/guardrails.md` — these apply to all output.
2. Load `prompts/system-prompt.md` — this is the persona + directives.
3. Load `prompts/ir-schema.md` — this is the full IR grammar, step-by-step extraction procedure (Step 0 content check → Step N emit records), and field definitions.
4. Use Claude's vision to read the attached image.
5. Emit IR as **JSON Lines** (one object per line), following the schema. Do not wrap in markdown fences or prose.
6. Prohibited content → emit the single `content_warning` record (schema Step 0) and stop.
7. Unreadable / not a workflow / more than 10 activities → emit the single `error` record with `check_id` `DIAGRAM_TYPE_VALIDATION` or `DIAGRAM_COMPLEXITY_ABOVE_THRESHOLD` (schema Step 1), show its `user_feedback` to the user, and stop.
8. Ambiguities and disconnected flows (e.g. a branch with no outgoing flow) → `unrecognized_item` records with `ask_user: true` (schema Step 2F). Never add an edge that is not drawn.

### BPMN path

1. Load `prompts/guardrails.md`.
2. Load `prompts/bpmn-to-ir.md` — deterministic BPMN-element → IR-record mapping.
3. Load `prompts/ir-schema.md` for the IR grammar.
4. Parse the `.bpmn` XML. Emit IR as JSON Lines following the mapping table — same `__type` records, same `content_warning` / `error` / `result` / `end_of_ir_stream` records as the image path.
5. Unsupported BPMN elements (see `bpmn-to-ir.md`) → emit `unrecognized_item` records (`category: "unsupported_element"`); do not silently drop.

Write the IR (without `system` progress records) to `<ProjectRoot>/.workflow.ir.jsonl` for reference — except when the stream is a `content_warning`, in which case write nothing. `examples/order-process.ir.jsonl` shows a complete valid stream.

## Phase 2: Validate IR

1. **Stream outcome** — read the last record (see "Consuming the IR" in `prompts/ir-schema.md`). `content_warning` or a Step 1 `error` → stop without writing code. `result` with `success: false` → go to step 3. Only `end_of_ir_stream` after `result` `success: true` continues.
2. **Re-check the structure** independently of the model's own `result`:
   - At least one `start_end_node` with `type: "start"` (or a trigger `wait_for_event` activity) and at least one end node (`type` `end`, `end_error` or `end_terminate`).
   - Every `edge.from` / `edge.to`, gateway `flows[].next` and wait `events[].next` references an existing `activity`, `gateway` or `start_end_node` id.
   - Every gateway has ≥ 1 incoming and ≥ 1 outgoing edge.
   - No orphaned nodes: no `activity`, `gateway`, **start node, end node or event** without edges (`CONNECTIVITY`).
   - Every `activity`, `gateway` and `start_end_node` — including every end node and every intermediate event — is reachable from a start node, following `edge` records and `failure_handling` links (`REACHABILITY`).
   - No duplicate ids across all records.
3. **Clarification path** — if a check fails, or `metadata.feedback_required` is `true`: report each failed `check_id` / each `unrecognized_item` with `ask_user: true` to the user in plain language, ask how to resolve it, and do not continue to Phase 3 until it is resolved. Apply the answers to the IR (or rerun Phase 1 with an adjusted diagram), then run Phase 2 again. Never add an undrawn edge without the user's confirmation.

## Phase 3: IR → code

1. Load `prompts/languages/<lang>.md` — this defines the target-language Dapr Workflow patterns, file layout, and code conventions, and (under "Reading the IR") the SDK call for each IR construct. Language slugs: `go` | `python` | `csharp` | `javascript` | `java`. The record → construct mapping itself is the "Consuming the IR" table in `prompts/ir-schema.md`, shared by all languages.
2. Optionally load `prompts/code-quality-judge.md` for a self-critique pass after initial generation.
3. Optionally load `prompts/final-turn-prettifier.md` for final cleanup.
4. Use the Write tool to create one file at a time. Follow the folder structure for the language — see `prompts/languages/<lang>.md`.
5. Emit complete, compilable files. The only placeholder allowed is a single `TODO: implement actual functionality` comment inside an activity body whose behaviour the diagram does not describe (see `prompts/guardrails.md`, "Output hygiene").

### Folder structure

Use the conventions defined in `prompts/languages/<lang>.md`. Typical shape:

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── resources/
│   └── statestore.yaml
├── <ProjectName>/
│   ├── workflow.(py|go|cs|ts|java)
│   ├── activities.(py|go|cs|ts|java)
│   └── models.(py|go|cs|ts|java)
├── README.md
└── .workflow.ir.jsonl       # persisted IR from Phase 1
```

Python-specific layout matches `create-workflow-python` (pyproject.toml, runtime.py, main.py); see that skill's SKILL.md and REFERENCE.md if you want deeper structure parity. This skill focuses on the diagram → IR → code transform, not on language-specific project scaffolding — keep the generated code minimal and runnable.

## Create README.md

Create a `README.md` in `<ProjectRoot>` containing:

1. One-sentence summary of what the workflow does (derive from the IR `metadata` record's `name` and `description`).
2. Architecture description — language, Dapr version, required components.
3. A Mermaid diagram re-rendered from the IR for quick visual reference.
4. How to run locally with `dapr run -f .` from `<ProjectRoot>` (picks up `dapr.yaml`).
5. Endpoints (if the generated language produces an HTTP surface — Python, .NET and JavaScript do by default).
6. Open questions — every remaining `unrecognized_item` from the IR (if any).
7. The **Diagrid Dapr Dev Dashboard** section, copied from the **README section** of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md): why it is useful, the install command for each OS (macOS / Linux and Windows) and the run command (`diagrid-dev-dashboard`, http://localhost:9090).
8. Next steps: run the `review-workflow-determinism`, `review-workflow-activity` and `review-workflow-management` skills to audit the generated code.

See `../dapr-shared/running-locally-dapr.md` and `../dapr-shared/running-with-catalyst.md` in this repo for snippets to include.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below followed by the Dev Dashboard recommendation — no preamble, no summary, no additional commentary. Replace `<ProjectRoot>` with the actual value:**

The <ProjectRoot> workflow application is created from the diagram. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally. The extracted IR is stored at `<ProjectRoot>/.workflow.ir.jsonl` for reference.

Then add, as a separate paragraph, the block from the **Final recommendation** section of [`../dapr-shared/dev-dashboard.md`](../dapr-shared/dev-dashboard.md) that matches `DevDashboardInstalled` (installed → start it; not installed → install it). Use it as written, including the link and the commands. Nothing may follow it.
