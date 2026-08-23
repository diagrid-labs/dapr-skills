# Agent Memory Checklist — .NET

Apply each rule below to every file in `agent_files` + `component_files` produced by `review-detect-target-agent.md`.

Rule source: see [`../create-agent-dotnet/REFERENCE.md`](../create-agent-dotnet/REFERENCE.md) — sections ".csproj" and "Program.cs (single agent)".

**Read this before applying the rules.** On the .NET path there is no `agent-memory` component. Conversation history for a turn sequence lives in a `SessionWorkflow` instance, and therefore in the `agent-workflow` (actor-enabled) store. A `.NET` project with no `agent-memory.yaml` is correct, not a finding.

| Rule id    | Severity | What to detect                                                                                                              | Why it matters                                                                                                  | Suggested fix                                                                                          |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| DAG-MEM-001 | critical | `agent-workflow` (or workflow-backing) state store component missing `actorStateStore: "true"`                              | Dapr Workflow runs on actors; without this flag the agent runtime fails at startup.                            | Add `actorStateStore: "true"` in the component metadata.                                               |
| DAG-MEM-003 | warning  | Component YAML has a plain-text `value:` under `name: key` (LLM API key hardcoded)                                          | Leaks credentials into source control.                                                                         | Use `{{ENV_VAR}}` templating or a `secretKeyRef` pointing at a secret store.                          |
| DAG-MEM-004 | warning  | An `agent-memory.yaml` **is** present and points at the same physical store *and* `keyPrefix` as `agent-workflow`           | Only applies if the project carries a memory component anyway; colliding keys corrupt workflow state.           | Use distinct components or distinct `keyPrefix` values — or drop `agent-memory.yaml`, which .NET does not use. |
| DAG-MEM-005 | warning  | `RunAgentAsync(...)` is called with no `AgentSession` argument, and no call to `CreateSessionAsync` / `AttachSession` exists anywhere in `agent_files` | Without a session, every request is a fresh conversation — the agent has no history, and the run is durable but not continuable. | Create a session on the first turn (`invoker.CreateSessionAsync(workflowClient)`), return its id, and `AttachSession(id)` on later turns. |
| DAG-MEM-006 | warning  | `.csproj` lists `Microsoft.Agents.AI`, `Microsoft.Extensions.AI` or `Dapr.Workflow` explicitly alongside `Diagrid.AI.Microsoft.AgentFramework` | Those arrive transitively at versions the package was built against; pinning them lower produces `NU1605` downgrade errors or a runtime `MissingMethodException`. | Remove the explicit `PackageReference`s and let them resolve transitively. |
| DAG-MEM-007 | warning  | No `resources/` folder, or no component with `actorStateStore: "true"`, while `dapr.yaml` sets `resourcesPath: ./resources` | `resourcesPath` replaces the default components installed by `dapr init`, so the workflow engine has no actor store and will not start. | Add `resources/agent-workflow.yaml` and `resources/llm-provider.yaml` (copy from `shared/`). Catalyst projects use managed components instead. |

## Cross-reference

Tool-function rules: `review-agent-tools-dotnet.md`. Orchestration rules: `review-agent-orchestration-dotnet.md`. Observability review has no .NET rules yet — see `review-agent-observability-dotnet.md`.
