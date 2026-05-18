---
name: create-workflow-from-diagram
description: This skill creates a Dapr workflow application from a diagram. Use this skill when the user provides a workflow image (PNG, JPG, JPEG, GIF, WebP) or a BPMN 2.0 XML file (.bpmn, .bpmn20.xml) and asks to "create a workflow from this diagram", "generate a Dapr workflow from this image", "scaffold a workflow from this BPMN", or similar. Output language is Go, Python, .NET (C#), Java, or JavaScript — selected by the user or inferred from the prompt.
allowed-tools:
  - Read
  - Write
  - Bash(mkdir:*)
  - Bash(ls:*)
model: opus
---

# Create Dapr Workflow from Diagram

## Overview

This skill converts a workflow diagram into a runnable Dapr workflow project. Two input paths are supported:

- **Image** (PNG / JPG / JPEG / GIF / WebP) — uses Claude's vision to extract workflow structure
- **BPMN 2.0 XML** (`.bpmn`, `.bpmn20.xml`) — parses the XML deterministically

Both paths produce the same intermediate representation (IR, JSON Lines), which is then rendered into code for the target language.

## Execution Order

You MUST follow these phases in strict order:

1. **Check specification** — Confirm you have the input diagram + target language. Ask clarifying questions only if missing.
2. **Phase 0: Detect input type** — Decide between the image path and the BPMN path.
3. **Phase 1: Diagram → IR** — Emit JSON Lines IR per `prompts/ir-schema.md`.
4. **Phase 2: Validate IR** — Light checks per `prompts/ir-schema.md` acceptance rules.
5. **Phase 3: IR → code** — Render the project for the target language using `prompts/languages/<lang>.md`.
6. **Create README.md** — Summarise the generated project + how to run it.
7. **Show final message** — Your LAST output MUST be EXACTLY the message defined in `## Show final message`. No extra text.

## Check specification

You need three things. Ask at most three clarifying questions, interview-style, only for items not already provided:

1. **Input diagram** — a path to a PNG/JPG/JPEG/GIF/WebP image or a `.bpmn` / `.bpmn20.xml` file. If the user pasted the image directly into the chat, use that.
2. **Target language** — one of: `go`, `python`, `csharp`, `javascript`, `java`. Default: `python`.
3. **Project name** — used as the folder name. No spaces. Defaults to a camelCased name derived from the workflow's `<bpmn:process @id>` or image filename.

## Prerequisites

The following must be installed by the user before running the generated project:

- [Docker](https://www.docker.com/products/docker-desktop/) or [Podman](https://podman.io/docs/installation)
- [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) (version 1.17+)

Plus the language toolchain for the chosen target. See the matching `shared/prereq-check-*.md` for the full list.

The skill **does not auto-install** anything. The generated project's README tells the user what to install and run.

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
6. If the diagram is unreadable / not a workflow / prohibited content → emit a single `ambiguous_or_undiagrammable_workflow` record (per schema Step 0) and stop.

### BPMN path

1. Load `prompts/guardrails.md`.
2. Load `prompts/bpmn-to-ir.md` — deterministic BPMN-element → IR-record mapping.
3. Load `prompts/ir-schema.md` for the IR grammar.
4. Parse the `.bpmn` XML. Emit IR as JSON Lines following the mapping table.
5. Unsupported BPMN elements (see `bpmn-to-ir.md`) → emit `unrecognized_item` records; do not silently drop.

Write the IR to `<ProjectRoot>/.workflow.ir.jsonl` for reference.

## Phase 2: Validate IR

Light structural checks before code generation:

- There is at least one `start` and one `end` record.
- Every `edge.from` / `edge.to` references an existing element id (activity, gateway, start, or end).
- Every gateway has ≥ 1 incoming and ≥ 1 outgoing edge.
- No orphaned elements (activities / gateways with no edges either direction).
- No duplicate ids across all records.

If any check fails: report the specific issue to the user, abort (do not continue to Phase 3). Rerun Phase 1 with an adjusted diagram or ask the user for clarification.

## Phase 3: IR → code

1. Load `prompts/languages/<lang>.md` — this defines the target-language Dapr Workflow patterns, file layout, and code conventions. Language slugs: `go` | `python` | `csharp` | `javascript` | `java`.
2. Optionally load `prompts/code-quality-judge.md` for a self-critique pass after initial generation.
3. Optionally load `prompts/final-turn-prettifier.md` for final cleanup.
4. Use the Write tool to create one file at a time. Follow the folder structure for the language — see `prompts/languages/<lang>.md`.
5. Emit complete, compilable files. No `TODO`, no placeholder bodies.

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

1. One-sentence summary of what the workflow does (derive from the diagram / IR `workflow` record).
2. Architecture description — language, Dapr version, required components.
3. A Mermaid diagram re-rendered from the IR for quick visual reference.
4. How to run locally with `dapr run -f dapr.yaml`.
5. Endpoints (if the generated language produces an HTTP surface — Python, .NET and JavaScript do by default).
6. How to inspect executions with the [Diagrid Dev Dashboard](https://www.diagrid.io/blog/improving-the-local-dapr-workflow-experience-diagrid-dashboard).

See `shared/running-locally-dapr.md` and `shared/running-with-catalyst.md` in this repo for snippets to include.

## Show final message

**IMPORTANT: This is the LAST step. After Create README.md, your final output MUST be ONLY the message below — no preamble, no summary, no additional commentary. Replace `<ProjectRoot>` with the actual value:**

The <ProjectRoot> workflow application is created from the diagram. Open the README.md file in the <ProjectRoot> folder for a summary and instructions for running locally. The extracted IR is stored at `<ProjectRoot>/.workflow.ir.jsonl` for reference.
