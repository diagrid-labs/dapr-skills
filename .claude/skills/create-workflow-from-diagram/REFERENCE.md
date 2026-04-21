# Reference: create-workflow-from-diagram

Companion document for `SKILL.md`. Covers the IR, the two input paths, per-language notes, and what's deliberately out of scope.

## Architecture

```
┌──────────────┐      ┌─────┐      ┌───────┐
│ Image / BPMN │ ───▶ │  IR │ ───▶ │ Code  │
└──────────────┘      └─────┘      └───────┘
     Phase 1         Phase 2/3
```

Phase 1 produces the intermediate representation (IR) — a canonical JSON Lines form that normalises both vision-extracted structures and BPMN elements. Phases 2/3 consume the IR and emit language-specific Dapr Workflow code. The IR isolates the generator from the input format, so adding new input types later (Mermaid, PlantUML) only requires a new Phase 1 prompt.

## IR at a glance

The IR is JSON Lines — one JSON object per line, no surrounding array, no wrapping markdown.

Core record types:

| `type` | Purpose |
|---|---|
| `workflow` | Top-level metadata (id, name) |
| `participant` | A swim lane / pool (cross-participant workflows only) |
| `start` | Entry point |
| `end` | Terminal state |
| `activity` | A unit of work; sub-types: `task`, `timer`, `wait_for_event`, `child_workflow` |
| `gateway` | Branch / merge; sub-types: `exclusive`, `parallel`, `inclusive`, `event_based`; role: `split` / `merge` |
| `edge` | Sequence flow between nodes; optional `condition` |
| `artifact` | Data object referenced by activities |
| `unrecognized_item` | Element that couldn't be mapped; preserved for the human reviewer |
| `ambiguous_or_undiagrammable_workflow` | Stop record; emitted when input fails Step 0 checks |

Full grammar + all fields + extraction procedure live in `prompts/ir-schema.md`. **Do not duplicate the schema in SKILL.md** — reference `prompts/ir-schema.md` and load it at Phase 1 time.

## Input paths

### Image path

Vision-based extraction. Supported mime types: PNG, JPG, JPEG, GIF, WebP. Claude reads the attached image and identifies standard workflow notation:

- Rounded rectangles → `activity` (`task`)
- Diamonds → `gateway`; internal symbol tells sub-type (`+` parallel, `×` exclusive, `O` inclusive, envelope icon → event-based)
- Circles → `start` or `end` based on thickness of the border
- Arrows → `edge`
- Swim lanes → `participant`

When visual cues are missing or ambiguous, the model emits `unrecognized_item` records rather than guessing. See `prompts/system-prompt.md` (persona) and `prompts/ir-schema.md` (full procedure).

### BPMN path

Structural parse; no vision required. BPMN 2.0 elements map one-to-one to IR records per the table in `prompts/bpmn-to-ir.md`. Advantages:

- Deterministic — the same BPMN always produces the same IR
- Works offline (no model vision inference)
- Handles large BPMN files that would exceed vision token budgets

Limitations: `adHocSubProcess`, `transaction`, `complexGateway`, multi-instance markers, compensation, escalation → emitted as `unrecognized_item` and deferred to human review.

### Mermaid / PlantUML / draw.io free-form

Out of scope for v1. Export to an image or to BPMN first. We'll add these in a follow-up once demand is clear.

## Per-language notes

The per-language prompts in `prompts/languages/*.md` define idiomatic Dapr Workflow code for each target:

- **Python** — `dapr-ext-workflow`, `@wfr.workflow(name=...)` decorator, activities with `@wfr.activity(name=...)`, Pydantic input/output models. Shares conventions with the `create-workflow-python` skill.
- **Go** — `dapr.io/dapr/workflow` package, `wf.Register(...)`, activity handlers registered with the runtime, structs for I/O.
- **C# / .NET** — `Dapr.Workflow` package, `IWorkflow` / `IActivity` interface impls, classes per activity. Shares conventions with `create-workflow-dotnet`.
- **Java** — `io.dapr.workflows` package, `Workflow` / `WorkflowActivity` interface impls, Maven build.
- **JavaScript / TypeScript** — `@dapr/dapr` Node SDK, `WorkflowRuntime.registerWorkflow(...)`, Promise-based activities.

Each prompt enumerates:

1. File layout + names
2. Imports + dependency list (pyproject.toml / go.mod / .csproj / pom.xml / package.json)
3. Deterministic-only rules for orchestrator bodies
4. Activity registration patterns
5. State-store component YAML
6. Entry-point / runtime boot

## Non-determinism rules

Every generated orchestrator body must be replayable. The generator's prompt forbids:

- `time.Now() / datetime.now()` inside the workflow — use `ctx.CurrentUTCDateTime` / equivalent
- `rand.*` inside the workflow — move to an activity
- I/O (HTTP, DB, file) inside the workflow — move to an activity
- Global mutable state reads inside the workflow
- `uuid.New()` / similar non-deterministic calls inside the workflow

If the diagram demands a non-deterministic step, the generator must wrap it in an activity.

## What this skill does NOT do

- **Does not install dependencies** — the user runs `uv sync`, `go mod tidy`, `dotnet restore`, etc. themselves. The generated README gives the commands.
- **Does not run the workflow** — scaffold-only.
- **Does not modify existing code** in a target directory. If `<ProjectRoot>` already exists and is non-empty, abort and ask.
- **Does not replace `create-workflow-python` / `create-workflow-dotnet` / `create-workflow-aspire`** — those skills produce more thorough project scaffolds from a text spec. If the user wants the richer Python / .NET experience, run this skill to get the IR, then feed the workflow's design into the matching per-language skill with the `<ProjectRoot>/.workflow.ir.jsonl` as reference.

## Follow-ups (not in v1)

- Formal IR validation via JSON Schema (currently prose checks only)
- Mermaid / PlantUML / draw.io free-form input
- Generation of activity bodies with real logic (currently stubs — the user fills in behaviour)
- Round-trip: code → IR → diagram (for keeping designs in sync)
