# Detect Review Target — Agents

Used by every `review-agent-*` skill to locate the target language, flavor, and scanned files before rules are applied.

## Step 1: Detect language and flavor

Probe the project root (or the user-specified scope folder) for the markers below. Run these probes in parallel where possible.

| Marker file / pattern                                                            | Language | Flavor              |
| -------------------------------------------------------------------------------- | -------- | ------------------- |
| `pyproject.toml` with `dapr-agents` dependency                                   | `python` | `native`            |
| `pyproject.toml` with `diagrid[` extra (e.g. `diagrid[openai_agents]`)           | `python` | `framework-wrapper` |
| `requirements.txt` referencing `dapr-agents`                                      | `python` | `native`            |
| `requirements.txt` referencing `diagrid[`                                         | `python` | `framework-wrapper` |
| `*.csproj` referencing `Microsoft.Extensions.AI` and any Diagrid / Dapr agent package | `dotnet` | `framework-wrapper` |

If multiple pyproject/requirements files exist in the scope, each is classified independently.

If no marker is found, stop the review and tell the user the target is not a recognized Dapr Agents project.

### Agent count

Count the number of subfolders that contain a recognized agent entrypoint (`main.py` for Python, `Program.cs` for .NET). If the count is > 1 and the project has `agent-pubsub.yaml` + `agent-registry.yaml` in `resources/`, classify topology as `orchestrator`; otherwise `single-agent`.

**Framework-wrapper caveat.** Wrapper frameworks encode multi-agent patterns in framework-specific shapes that do not always include the pubsub + registry markers: CrewAI uses `Crew(process=Process.hierarchical)`, LangGraph uses compiled subgraphs in a single process, Pydantic AI supports multi-agent via `AgentRunContext`. When `flavor == framework-wrapper` **and** the entrypoint count is > 1 **but** the pubsub / registry markers are absent, classify topology as `single-agent` for the primary decision path **and** surface a "Please verify" finding asking the user to confirm the project is truly single-agent before `review-agent-orchestration` is skipped. A false-single-agent classification silently suppresses the orchestration rules that would apply to those projects.

## Step 2: Locate agent code

Build file lists scoped to the agreed folder from `review-scope-prompt.md`.

### Python targets

- **Agent files** — files containing `DurableAgent(`, `AgentRunner(`, `DaprWorkflowAgentRunner(`, or `DaprWorkflowGraphRunner(` (use `Grep` on `**/*.py`). Conventional file: `main.py`.
- **Tool files** — files containing the `@tool` decorator (use `Grep` for `@tool\b` on `**/*.py`). Conventional file: `tools.py`. Agents may also register tools inline in `main.py`.
- **Component files** — every yaml in `resources/` with `kind: Component` or `kind: Configuration` (use `Grep` on `resources/**/*.yaml`).
- **dapr.yaml** — the multi-app run file at the project root, named exactly `dapr.yaml`.

### .NET targets

- **Agent files** — files containing `AddDaprAgents(`, `WithAgent(`, or `IDaprAgentInvoker` (use `Grep` on `**/*.cs`). Conventional file: `Program.cs`.
- **Tool files** — files containing `AIFunctionFactory.Create(` (use `Grep` on `**/*.cs`). Conventional folder: `Tools/`.
- **Component files** — every yaml in `resources/` (same as Python).

## Step 3: Record the target

Pass the following structured result back to the calling skill:

```
language: python | dotnet
flavor: native | framework-wrapper
topology: single-agent | orchestrator
agent_files: [ ... ]
tool_files: [ ... ]
component_files: [ ... ]
dapr_yaml: <path or null>
scope_root: <absolute path>
```

Empty lists are valid. Each calling review skill decides whether an empty list is a finding, a warning, or simply benign (for example `review-agent-orchestration` is silent when `topology` is `single-agent`).
