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

There is exactly one IR schema, `prompts/ir-schema.md`. The image path and the BPMN path (`prompts/bpmn-to-ir.md`) both emit it, Phase 2 validates it, and every `prompts/languages/<lang>.md` prompt reads it. Each record's kind is its `__type` field; a plain `type` field is always a sub-type inside the record.

| `__type` | Purpose |
|---|---|
| `metadata` | First record: `name`, `description`, `source` (`image` / `bpmn`), `process_id` (BPMN), `complexity`, `feedback_required` |
| `participant` | A swim lane / pool, or the default `system` participant |
| `start_end_node` | Start (`type: "start"`) or end (`type: "end"`, `"end_error"`, `"end_terminate"`) event |
| `activity` | Unit of work. `type: "task"` with a `task_type` (`service_task`, `user_task`, `call_activity`, …) or `type: "wait_for_event"` with an `events` array (timers, messages, signals) |
| `gateway` | `type`: `exclusive`, `parallel`, `inclusive`, `event-based`; `role`: `diverging` / `converging`; `flows` carry `condition`, `condition_label`, `is_default`, `next` |
| `edge` | Sequence flow: `from`, `to`, optional `id` (BPMN), `gw_flow_condition`, `visual_label` |
| `failure_handling` | Boundary event attached to an activity (error, timer, message, signal) |
| `data_object` | Data input / output / store used by activities |
| `unrecognized_item` | Ambiguity, disconnected flow or unsupported element; `ask_user: true` items go to the user before code is generated |
| `content_warning` | Stop record for prohibited content (Step 0); the only line in the stream |
| `error` | Fatal record with a `check_id`: `DIAGRAM_TYPE_VALIDATION` / `DIAGRAM_COMPLEXITY_ABOVE_THRESHOLD` (undiagrammable input) or a validation check id |
| `result` | Validation outcome (`success`, `failed_checks`) |
| `end_of_ir_stream` | Last line of a valid stream |
| `system` | Progress output only; dropped before the IR is persisted |

Full grammar + all fields + extraction procedure + the record → code mapping ("Consuming the IR") live in `prompts/ir-schema.md`. **Do not duplicate the schema in SKILL.md** — reference `prompts/ir-schema.md` and load it at Phase 1 time.

## Input paths

### Image path

Vision-based extraction. Supported mime types: PNG, JPG, JPEG, GIF, WebP. Claude reads the attached image and identifies standard workflow notation:

- Rounded rectangles → `activity` (`type: "task"`)
- Diamonds → `gateway`; internal symbol tells sub-type (`+` parallel, `×` exclusive, `O` inclusive, envelope / pentagon icon → event-based)
- Plain circles → `start_end_node` with `type: "start"` (thin border) or `"end"` (thick border); circles with a clock / envelope icon → `activity` with `type: "wait_for_event"`
- Arrows → `edge`
- Swim lanes → `participant`

When visual cues are missing or ambiguous, the model emits `unrecognized_item` records rather than guessing. See `prompts/system-prompt.md` (persona) and `prompts/ir-schema.md` (full procedure).

### BPMN path

Structural parse; no vision required. BPMN 2.0 elements map one-to-one to IR records per the table in `prompts/bpmn-to-ir.md`. Advantages:

- Deterministic — the same BPMN always produces the same IR
- Works offline (no model vision inference)
- Handles large BPMN files that would exceed vision token budgets

Limitations: `adHocSubProcess`, `transaction`, `complexGateway`, multi-instance markers, compensation, escalation → emitted as `unrecognized_item` (`category: "unsupported_element"`) and deferred to human review.

### Mermaid / PlantUML / draw.io free-form

Out of scope for v1. Export to an image or to BPMN first. We'll add these in a follow-up once demand is clear.

## Examples

The `examples/` folder holds three inputs. They serve different purposes:

| Example | Path | Purpose |
|---|---|---|
| `examples/order-process.bpmn` | BPMN | **Happy path.** Valid process: exclusive gateway with a default flow, parallel split/join (charge payment + ship item), a human backorder decision, a 7-day timer loop back to inventory, and two end events (`orderComplete`, `orderCancelled`) that are both reachable. Its expected IR is `examples/order-process.ir.jsonl`. |
| `examples/user-order.png` | Image | **Happy path.** Swimlane flowchart with four participants, seven activities, two exclusive decisions (including a change-request loop) and two end states. |
| `examples/pizza-order.png` | Image | **Ambiguity / clarification path — intentionally not clean.** A two-pool BPMN-style collaboration with message flows and an event-based gateway that races a "pizza received" message against a 60-minute timer. The 60-minute timer branch has **no outgoing sequence flow**, and "call pizza delivery service" has **no incoming sequence flow**. The skill must not guess the missing connection: Phase 1 records it as an `unrecognized_item` with `category: "disconnected_flow"` and `ask_user: true` (and sets `metadata.feedback_required: true`), validation reports it, and Phase 2 asks the user how the flows connect before any code is generated. |

Use `order-process.bpmn` or `user-order.png` to demonstrate the skill end to end; use `pizza-order.png` to demonstrate how it handles a diagram with gaps.

## Per-language notes

The per-language prompts in `prompts/languages/*.md` define idiomatic Dapr Workflow code for each target:

- **Python** — `dapr-ext-workflow`, `@wfr.workflow(name=...)` decorator, activities with `@wfr.activity(name=...)`, Pydantic input/output models. Shares conventions with the `create-workflow-python` skill.
- **Go** — `github.com/dapr/go-sdk/workflow` package, `workflow.NewWorker()` with `RegisterWorkflow(...)` / `RegisterActivity(...)`, structs for I/O.
- **C# / .NET** — `Dapr.Workflow` package, classes deriving from `Workflow<TInput, TOutput>` and `WorkflowActivity<TInput, TOutput>`, one class per activity. Shares conventions with `create-workflow-dotnet`.
- **Java** — `io.dapr.workflows` package, `Workflow` / `WorkflowActivity` interface impls, Maven build.
- **JavaScript / TypeScript** — `@dapr/dapr` Node SDK, `WorkflowRuntime.registerWorkflow(...)`, Promise-based activities.

Each prompt ends with a "Reading the IR" section that lists the SDK call for every IR construct in the shared "Consuming the IR" table of `prompts/ir-schema.md`, so all five languages read the same IR the same way. Each prompt enumerates:

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
- Generation of activity bodies with real logic (currently stubs carrying a single `TODO: implement actual functionality` marker when the diagram does not describe the behaviour — the user fills it in)
- Round-trip: code → IR → diagram (for keeping designs in sync)
