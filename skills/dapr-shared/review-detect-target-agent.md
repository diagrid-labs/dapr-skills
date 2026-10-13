# Detect Review Target — Agents

Used by every `review-agent-*` skill to locate the target language, flavor, and scanned files before rules are applied.

## Step 1: Detect language and flavor

Probe the project root (or the user-specified scope folder) for the markers below. Run these probes in parallel where possible.

### Language

| Marker file / pattern                                                            | Language | Flavor              |
| -------------------------------------------------------------------------------- | -------- | ------------------- |
| `pyproject.toml` or `requirements.txt` referencing `dapr-agents` or `diagrid[` (e.g. `diagrid[openai_agents]`) | `python` | decided by imports, see below |
| `*.csproj` referencing `Diagrid.AI.Microsoft.AgentFramework` | `dotnet` | `framework-wrapper` |
| `*.csproj` referencing `Microsoft.Agents.AI` or `Microsoft.Extensions.AI` **and** `Dapr.Workflow` | `dotnet` | `framework-wrapper` |

If multiple pyproject/requirements files exist in the scope, each is classified independently.

If no marker is found, stop the review and tell the user the target is not a recognized agent project.

Note for the .NET row: `Diagrid.AI.Microsoft.AgentFramework` brings `Microsoft.Agents.AI`, `Microsoft.Extensions.AI` and `Dapr.Workflow` in transitively, so a single-agent scaffold may list only the one package. Projects that define their own workflows usually also reference `Dapr.Workflow` explicitly. Do not require the transitive names to be present in the csproj.

### Python flavor

Decide the flavor from imports, **not** from the dependency line: `diagrid[<extra>]` projects depend on `dapr-agents` too. Grep `**/*.py` in scope:

- **Wrapper file** — imports `diagrid.agent.` (`^\s*(from|import)\s+diagrid\.agent\.`). The wrapped framework is the next path segment (`diagrid.agent.openai_agents` → `openai_agents`; one of `adk`, `claude_agents`, `crewai`, `deepagents`, `holmesgpt`, `langchain`, `langgraph`, `openai_agents`, `pydantic_ai`, `smolagents`, `strands`). A wrapper file may also import `dapr_agents` (for example `AgentRegistryConfig` for `registry_config=`); it stays a wrapper file.
- **Native file** — imports `dapr_agents` (`^\s*(from|import)\s+dapr_agents\b`) and does not import `diagrid.agent.`.
- **Other files** (tool modules, helpers) take the flavor of the agent file in the same app folder (the `appDirPath` from `dapr.yaml`, else the same directory). If that is ambiguous, they take the project flavor.

Project flavor:

| Files found                          | `flavor`  |
| ------------------------------------ | --------- |
| native files only                    | `native`  |
| wrapper files only                   | `wrapper` |
| both (e.g. a native `DurableAgent` coordinator with wrapper specialists) | `mixed`   |

If a Python dependency marker is present but no file imports either package, stop the review and tell the user the target is not a recognized agent project.

**Mixed projects.** In a `mixed` project, every rule is applied per entrypoint/file using that file's own flavor (`file_flavors` below). A rule marked native-only never fires on a wrapper file, and the reverse.

### Agent count

Count the agent entrypoints:

- **Python** — if `dapr.yaml` exists, count the apps it lists (one file may run several apps, selected by a command-line argument). Otherwise count the files that construct a wrapper runner (`DaprWorkflow\w*Runner\(`) or a `DurableAgent(`. Entrypoint file names vary (`main.py`, `simple_agent.py`, …).
- **.NET** — count the number of subfolders that contain a recognized agent entrypoint (`Program.cs`).

Then:

- **Python** — classify topology as `orchestrator` if **any** of the following holds; otherwise `single-agent`:
  - the entrypoint count is > 1 **and** at least one pub/sub marker is present: `resources/agent-pubsub.yaml` (or any `pubsub.*` component in `resources/`), an `AgentPubSubConfig(` call (native), or a `pubsub_name=` / `publish_topic=` / `subscribe_topic=` argument (wrapper `runner.serve(...)`);
  - a native multi-agent marker is present: `orchestration_mode=` (on `AgentExecutionConfig`), `agent_to_tool(`, `call_agent(` or `trigger_agent(`;
  - `flavor == mixed` **and** the entrypoint count is > 1 (native coordinator dispatching to wrapper specialists through the agent registry);
  - a deepagents `AsyncSubAgent(` is constructed (sub-agents run as separate apps reached over HTTP).

  `agent-registry.yaml` is **not** required: a missing registry is what `DAG-ORCH-005` reports, so it must not decide the topology.
- **.NET** — classify as `orchestrator` if **any** of the following holds; otherwise `single-agent`:
  - a single project registers two or more agents (two or more `WithAgent(` calls, or a `WithAgent(` call inside a loop), **or** a class deriving from `Workflow<` calls `RunAgentAsync(`, `RunAgentWithHistoryAsync(` or `RunAgentAndDeserializeAsync(` on its `WorkflowContext` → `shape: in-process`;
  - the entrypoint count is > 1 (separate agent apps listed in `dapr.yaml`), with or without `agent-pubsub.yaml` → `shape: multi-app`.

  Do not require `agent-registry.yaml`: there is no local registry component on the .NET path (it is a Catalyst opt-in via `.WithCatalyst(...)`).

**Wrapper caveat.** Wrapped frameworks can encode multi-agent patterns that carry none of the markers above: LangGraph composes agents as compiled subgraphs or `Send` fan-out inside one graph, and deepagents sub-agents can be reached over the Agent Protocol (HTTP) through a hand-written client instead of `AsyncSubAgent(`. When `language == python`, `flavor == wrapper`, **and** the entrypoint count is > 1 **but** no Python orchestrator condition above holds, classify topology as `single-agent` **and** set `topology_unverified: true`. Only `review-agent-orchestration` acts on this flag: it reports it as the `DAG-ORCH-010` "Please verify" finding instead of its single-agent result, so a false single-agent classification never silently suppresses the orchestration rules. The other `review-agent-*` skills ignore the flag.

## Step 2: Locate agent code

Build file lists scoped to the agreed folder from `review-scope-prompt.md`.

### Python targets

- **Agent files** — files (use `Grep` on `**/*.py`) containing any of:
  - a wrapper runner, `DaprWorkflow\w*Runner\(` (covers `DaprWorkflowAgentRunner`, `DaprWorkflowGraphRunner`, `DaprWorkflowDeepAgentRunner`, `DaprWorkflowHolmesRunner`), or the Strands building blocks `DaprWorkflowToolExecutor(` / `DaprAgentWorkflow(`;
  - `DurableAgent(` — native when the file imports `dapr_agents`; a wrapper (Strands) agent when it imports `diagrid.agent.strands` (`diagrid` ships its own Strands `DurableAgent`);
  - `AgentRunner(` in a file that imports `dapr_agents`.
- **Tool files** — files containing a tool definition for the framework in use (use `Grep` on `**/*.py`):

  | Marker | Frameworks |
  | ------ | ---------- |
  | `@tool` / `@tool(` decorator (`@tool\b`) | native (`dapr_agents`), claude_agents (`claude_agent_sdk`), crewai (`crewai.tools`), langchain / langgraph / deepagents (`langchain_core.tools`), smolagents, strands |
  | `@function_tool` | openai_agents |
  | `FunctionTool(` | adk |
  | `@<agent>.tool` / `@<agent>.tool_plain` (`@\w+\.tool(_plain)?\b`) | pydantic_ai |
  | a class deriving from `BaseTool` or `Tool` | crewai, smolagents, langchain |
  | `StructuredTool.from_function(` | langchain / langgraph / deepagents |
  | a plain function named in a `tools=[...]` list (agent constructor, `create_react_agent(`, `create_agent(`, runner `tools=`) | native, pydantic_ai, adk, langchain / langgraph, claude_agents |
  | a node function passed to `add_node(` | langgraph |
  | MCP-sourced tools: `MCPClient(`, `AgentTool.from_mcp(` / `from_mcp_many(` | native |

  A file qualifies when it contains the marker or defines a function the marker refers to. Conventional file: `tools.py`; agents also define tools inline in the entrypoint. The "tool body" for the review rules is the decorated function, the `_run` / `forward` method of a tool class, the function wrapped by `FunctionTool(` / `StructuredTool.from_function(`, the plain function listed in `tools=[...]`, or the node function.
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
flavor: native | wrapper | mixed       # python
        framework-wrapper              # dotnet (always)
topology: single-agent | orchestrator
shape: in-process | multi-app | null   # .NET orchestrator only
topology_unverified: true | false      # Python wrapper caveat only
agent_files: [ ... ]
tool_files: [ ... ]
component_files: [ ... ]
file_flavors: { <path>: native | wrapper }      # python agent and tool files
wrapper_frameworks: { <path>: <framework> }     # python wrapper files, e.g. openai_agents
dapr_yaml: <path or null>
scope_root: <absolute path>
```

Empty lists are valid. Each calling review skill decides whether an empty list means there is nothing to review (for example `review-agent-tools` with no `tool_files`, or `review-agent-orchestration` when `topology` is `single-agent`) or is simply benign.
