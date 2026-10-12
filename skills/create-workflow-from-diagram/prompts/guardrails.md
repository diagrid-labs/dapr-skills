# Guardrails

## Scope

This skill extracts workflow structure from diagrams (images or BPMN XML) and produces Dapr workflow code. Stay within that scope:

- Do **not** execute the generated workflow — only produce its files. The user runs it themselves.
- Do **not** fetch remote resources, call external APIs, or download dependencies beyond what the target language's standard toolchain (`pip`, `go get`, `npm install`, `dotnet add package`, `mvn`) requires for the generated project.
- Do **not** invent workflow logic not present in the input diagram. If a step is ambiguous or a flow is disconnected, emit an `unrecognized_item` IR record (see `ir-schema.md`) rather than guess, and do not add edges that are not drawn.

## Prohibited content

If the input diagram depicts anything outside ordinary business workflow logic — e.g. illegal activity, abuse, weapons design — refuse politely: emit the single `content_warning` IR record (`ir-schema.md` Step 0) and stop.

A diagram that is safe but cannot be processed as a workflow (unreadable, not a process diagram, too many activities for the image path) is not prohibited content: emit the `error` record with `check_id: "DIAGRAM_TYPE_VALIDATION"` or `"DIAGRAM_COMPLEXITY_ABOVE_THRESHOLD"` (`ir-schema.md` Step 1) and stop.

## Non-deterministic workflow code

Dapr Workflows require **deterministic** orchestrator code. The generated workflow must never:

- Read the current wall-clock time directly (use `Context.CreateTimer` / equivalent)
- Generate random values inside the orchestrator (move to an activity)
- Call external services or make I/O inside the orchestrator (move to an activity)
- Rely on environment variables or global mutable state inside the orchestrator

These rules are covered in `languages/<lang>.md` — honour them even if the diagram's intent seems to require otherwise.

## Output hygiene

- Emit **JSON Lines** (one JSON object per line, no trailing commas, no markdown fences) during the IR phase.
- Emit **complete, compilable files** during the code phase. Workflow (orchestrator) code, models, runtime/entry-point code, project files and component YAML must be fully written — no pseudo-code, no `...` bodies, no `TODO` / `FIXME` comments, no "add your logic here" notes.
- **One exception — activity bodies.** A diagram says *what* an activity does, not *how*. When the behaviour is not known, the activity body contains a minimal, compilable stub that returns a value of its declared output type, plus exactly one marker comment: `TODO: implement actual functionality` in the language's comment syntax (`// TODO: implement actual functionality` in Go, C#, Java and JavaScript; `# TODO: implement actual functionality` in Python). This matches the activity convention of the `create-workflow-*` skills. Use no other placeholder wording and no other `TODO`s. When the diagram or the user does describe the behaviour, implement it and omit the marker.
- Use the existing Write tool to create files; do not echo large payloads into the chat.
