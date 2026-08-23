# Agent Memory Checklist — .NET

Apply each rule below to every file in `agent_files` + `component_files` produced by `review-detect-target-agent.md`.

Rule source: see [`../create-agent-dotnet/REFERENCE.md`](../create-agent-dotnet/REFERENCE.md) — section "Memory and state".

| Rule id    | Severity | What to detect                                                                                                              | Why it matters                                                                                                  | Suggested fix                                                                                          |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| DAG-MEM-001 | critical | `agent-workflow` (or workflow-backing) state store component missing `actorStateStore: "true"`                              | Dapr Workflow runs on actors; without this flag the agent runtime fails at startup.                            | Add `actorStateStore: "true"` in the component metadata.                                               |
| DAG-MEM-003 | warning  | Component YAML has a plain-text `value:` under `name: key` (LLM API key hardcoded)                                          | Leaks credentials into source control.                                                                         | Use `{{ENV_VAR}}` templating or a `secretKeyRef` pointing at a secret store.                          |
| DAG-MEM-004 | warning  | `agent-memory` and `agent-workflow` point at the same physical store with the same `keyPrefix`                              | Conversation history and workflow state collide.                                                               | Use two distinct components or distinct `keyPrefix` values.                                           |
| DAG-MEM-005 | info     | `AddDaprAgents().WithAgent(...)` missing memory configuration extension (e.g. `.WithMemory(...)` or equivalent option)       | Agent will not persist conversation across restarts.                                                           | Call the appropriate memory extension or pass a `memory` option pointing at the Dapr memory component. |
| DAG-MEM-006 | warning  | `.csproj` missing `Dapr.AppCallback.AspNetCore` or the equivalent Dapr runtime package expected by the invoker               | Runtime will refuse to bind `/run` endpoint.                                                                    | Add the missing package via `dotnet add package ...`.                                                 |
| DAG-MEM-007 | warning  | No `resources/` folder or no component YAMLs in the project — .NET quickstart from upstream targets Catalyst-managed state  | Running on open-source Dapr requires explicit component YAMLs; Catalyst projects rely on managed ones.         | Add `resources/agent-memory.yaml`, `agent-workflow.yaml`, `llm-provider.yaml` (copy from `shared/`).  |

## Cross-reference

Tool-function rules: `review-agent-tools-dotnet.md`. Orchestration rules: `review-agent-orchestration-dotnet.md`. Observability review is Python-only for now.
