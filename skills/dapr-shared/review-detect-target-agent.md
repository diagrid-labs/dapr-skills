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
| `*.csproj` referencing `Diagrid.AI.Microsoft.AgentFramework` | `dotnet` | `framework-wrapper` |
| `*.csproj` referencing `Microsoft.Agents.AI` or `Microsoft.Extensions.AI` **and** `Dapr.Workflow` | `dotnet` | `framework-wrapper` |

If multiple pyproject/requirements files exist in the scope, each is classified independently.

If no marker is found, stop the review and tell the user the target is not a recognized agent project.

Note for the .NET row: `Diagrid.AI.Microsoft.AgentFramework` brings `Microsoft.Agents.AI`, `Microsoft.Extensions.AI` and `Dapr.Workflow` in transitively, so a single-agent scaffold may list only the one package. Projects that define their own workflows usually also reference `Dapr.Workflow` explicitly. Do not require the transitive names to be present in the csproj.

### Agent count

Count the number of subfolders that contain a recognized agent entrypoint (`main.py` for Python, `Program.cs` for .NET). Then:

- **Python** — classify topology as `orchestrator` if the count is > 1 **and** at least one pub/sub marker is present: `resources/agent-pubsub.yaml` (or any `pubsub.*` component in `resources/`), an `AgentPubSubConfig(` call (native), or a `publish_topic=` / `subscribe_topic=` argument (wrapper `runner.serve(...)`). Otherwise classify as `single-agent`. `agent-registry.yaml` is **not** required: a missing registry is what `DAG-ORCH-005` reports, so it must not decide the topology.
- **.NET** — classify as `orchestrator` if **any** of the following holds; otherwise `single-agent`:
  - a single project registers two or more agents (two or more `WithAgent(` calls, or a `WithAgent(` call inside a loop), **or** a class deriving from `Workflow<` calls `RunAgentAsync(`, `RunAgentWithHistoryAsync(` or `RunAgentAndDeserializeAsync(` on its `WorkflowContext` → `shape: in-process`;
  - the entrypoint count is > 1 (separate agent apps listed in `dapr.yaml`), with or without `agent-pubsub.yaml` → `shape: multi-app`.

  Do not require `agent-registry.yaml`: there is no local registry component on the .NET path (it is a Catalyst opt-in via `.WithCatalyst(...)`).

**Framework-wrapper caveat.** Wrapper frameworks encode multi-agent patterns in framework-specific shapes that do not always include the pub/sub markers: CrewAI uses `Crew(process=Process.hierarchical)`, LangGraph uses compiled subgraphs in a single process, Pydantic AI supports multi-agent via `AgentRunContext`. When `language == python`, `flavor == framework-wrapper`, **and** the entrypoint count is > 1 **but** no pub/sub marker is present, classify topology as `single-agent` **and** set `topology_unverified: true`. Only `review-agent-orchestration` acts on this flag: it reports it as the `DAG-ORCH-010` "Please verify" finding instead of its single-agent result, so a false single-agent classification never silently suppresses the orchestration rules. The other `review-agent-*` skills ignore the flag.

## Step 2: Locate agent code

Build file lists scoped to the agreed folder from `review-scope-prompt.md`.

### Python targets

- **Agent files** — files containing `DurableAgent(`, `AgentRunner(`, `DaprWorkflowAgentRunner(`, or `DaprWorkflowGraphRunner(` (use `Grep` on `**/*.py`). Conventional file: `main.py`.
- **Tool files** — files containing the `@tool` decorator (use `Grep` for `@tool\b` on `**/*.py`). Conventional file: `tools.py`. Agents may also register tools inline in `main.py`.
- **Component files** — every yaml in `resources/` with `kind: Component` or `kind: Configuration` (use `Grep` on `resources/**/*.yaml`).
- **dapr.yaml** — the multi-app run file at the project root, named exactly `dapr.yaml`.

### .NET targets

- **Agent files** — files containing `AddDaprAgents(`, `WithAgent(`, `IDaprAgentInvoker`, or `.RunAgentAsync(` / `.RunAgentWithHistoryAsync(` on a `WorkflowContext` (use `Grep` on `**/*.cs`). Conventional files: `Program.cs` and `Workflows/*.cs`.
- **Tool files** — files containing `AIFunctionFactory.Create(` (use `Grep` on `**/*.cs`). Conventional folder: `Tools/`.
- **Component files** — every yaml in `resources/` (same as Python).

## Step 3: Record the target

Pass the following structured result back to the calling skill:

```
language: python | dotnet
flavor: native | framework-wrapper
topology: single-agent | orchestrator
shape: in-process | multi-app | null   # .NET orchestrator only
topology_unverified: true | false      # Python framework-wrapper caveat only
agent_files: [ ... ]
tool_files: [ ... ]
component_files: [ ... ]
dapr_yaml: <path or null>
scope_root: <absolute path>
```

Empty lists are valid. Each calling review skill decides whether an empty list means there is nothing to review (for example `review-agent-tools` with no `tool_files`, or `review-agent-orchestration` when `topology` is `single-agent`) or is simply benign.
