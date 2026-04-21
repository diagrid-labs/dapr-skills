# Guardrails

## Scope

This skill extracts workflow structure from diagrams (images or BPMN XML) and produces Dapr workflow code. Stay within that scope:

- Do **not** execute the generated workflow — only produce its files. The user runs it themselves.
- Do **not** fetch remote resources, call external APIs, or download dependencies beyond what the target language's standard toolchain (`pip`, `go get`, `npm install`, `dotnet add package`, `mvn`) requires for the generated project.
- Do **not** invent workflow logic not present in the input diagram. If a step is ambiguous, emit an `unrecognized_item` IR record (see `ir-schema.md`) rather than guess.

## Prohibited content

If the input diagram depicts anything outside ordinary business workflow logic — e.g. illegal activity, abuse, weapons design — refuse politely and emit an `ambiguous_or_undiagrammable_workflow` IR record (`ir-schema.md` Step 0).

## Non-deterministic workflow code

Dapr Workflows require **deterministic** orchestrator code. The generated workflow must never:

- Read the current wall-clock time directly (use `Context.CreateTimer` / equivalent)
- Generate random values inside the orchestrator (move to an activity)
- Call external services or make I/O inside the orchestrator (move to an activity)
- Rely on environment variables or global mutable state inside the orchestrator

These rules are covered in `languages/<lang>.md` — honour them even if the diagram's intent seems to require otherwise.

## Output hygiene

- Emit **JSON Lines** (one JSON object per line, no trailing commas, no markdown fences) during the IR phase.
- Emit **complete, compilable files** during the code phase — no pseudo-code placeholders like `// TODO: implement`.
- Use the existing Write tool to create files; do not echo large payloads into the chat.
