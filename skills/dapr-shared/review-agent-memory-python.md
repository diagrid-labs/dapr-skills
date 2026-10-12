# Agent Memory Checklist — Python

Apply each rule below to every file in `agent_files` + `component_files` produced by `review-detect-target-agent.md`.

Rule source: see [`../create-agent-python/REFERENCE.md`](../create-agent-python/REFERENCE.md) — section "Memory and state".

| Rule id    | Severity | What to detect                                                                                                                             | Why it matters                                                                                                     | Suggested fix                                                                                           |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| DAG-MEM-001 | critical | `agent-workflow` state store component is missing `actorStateStore: "true"` (or the component used by `StateStoreService(store_name=...)`) | Dapr Workflow is built on actors; without `actorStateStore: "true"` the workflow engine will not run.             | Add `actorStateStore: "true"` in the component metadata.                                                |
| DAG-MEM-002 | critical | `ConversationListMemory` used in any agent file that is not clearly a local example                                                        | `ConversationListMemory` is in-process only and is lost on restart — catastrophic for a durable agent.            | Switch to `ConversationDaprStateMemory(store_name="agent-memory")` backed by a persistent store.        |
| DAG-MEM-003 | warning  | Any `value:` field directly under `name: key` in a component YAML where the value is NOT `{{[A-Z_]+}}` templating AND NOT a `secretKeyRef:` reference | Leaks credentials into source control and into log output.                                                        | Use `{{ENV_VAR}}` templating or a `secretKeyRef` pointing at a secret store.                           |
| DAG-MEM-004 | warning  | `agent-memory` and `agent-workflow` point at the same physical store with the same `keyPrefix`                                              | Conversation history and workflow state collide; chat turns can corrupt workflow execution.                        | Use two distinct components, or two distinct `keyPrefix` values.                                        |
| DAG-MEM-005 | info     | `DurableAgent(...)` has no `memory=` keyword                                                                                                | Agent forgets context between runs; fine for stateless tools but usually unintended.                               | Add `memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory"))`.           |
| DAG-MEM-006 | warning  | No `state=AgentStateConfig(...)` on a `DurableAgent(...)` declaration                                                                       | Workflow execution state falls back to defaults; risks inconsistency across restarts.                              | Add `state=AgentStateConfig(store=StateStoreService(store_name="agent-workflow"))`.                    |
| DAG-MEM-007 | info     | `agent-memory` component has `actorStateStore: "true"`                                                                                      | Conversation memory does not use the actor framework — this flag is a misconfiguration, not a breakage.            | Set `actorStateStore: "false"` on the `agent-memory` component to keep its purpose clear.               |
| DAG-MEM-008 | warning  | `agent-registry` component is missing `keyPrefix: none` (only applies to multi-agent projects)                                              | Default keyPrefix includes appID; specialists cannot discover each other.                                          | Add `- name: keyPrefix` with `value: none`.                                                             |

## Confidence notes

- DAG-MEM-002 — If the file has explicit comments indicating dev-only (e.g. `# dev memory only`) or lives in an `examples/` folder, downgrade to "Please verify" rather than critical.
- DAG-MEM-003 detection is specific: the `value:` of a metadata entry whose `name:` is `key` (or `apiKey`, `accessToken`, `password`) must match `^"{{[A-Z_]+}}"$` (literal templating) or use `secretKeyRef:` on the same entry. Any other value triggers the rule. Bypass shapes to treat as "Please verify":
  - Commented-out plaintext keys elsewhere in the file (grep `^\s*#\s*value:\s*['"]?sk-`) — the commented value is not active but the intent is suspicious.
  - Base64-encoded values (`^[A-Za-z0-9+/=]{40,}$` without `{{...}}` templating) — may be a real key or an opaque identifier.
  - YAML anchors (`&` / `*`) resolving to a hardcoded string defined elsewhere in the file.
  - Provider key shapes to watch for: OpenAI `sk-`, `sk-proj-`; Anthropic `sk-ant-`; Google `AIza`; Azure `{apiKey}` pattern.

## Cross-reference

Observability-related rules about tracing endpoints appear in `review-agent-observability-python.md`. Tool-function rules are in `review-agent-tools-python.md`.
