# Reference: review-agent-memory

## Sample report

For a Python project where `resources/agent-workflow.yaml` is missing the `actorStateStore` flag and the `llm-provider.yaml` contains a hardcoded `OPENAI_API_KEY`:

```
# Dapr review — review-agent-memory

Target: /Users/x/my-agent
Language: python
Found: 1 critical, 1 warning, 0 suggestions, 0 to verify

## Critical
- [DAG-MEM-001] `resources/agent-workflow.yaml:8` — agent-workflow state store missing actorStateStore: "true"
  Why: Dapr Workflow runs on actors; with no actor state store in resources/ the workflow engine does not start.
  Fix: Add `- name: actorStateStore\n    value: "true"` in the component metadata.

## Warnings
- [DAG-MEM-003] `resources/llm-provider.yaml:10` — OPENAI_API_KEY hardcoded as value
  Why: Leaks the key into source control and log output.
  Fix: Replace with `value: "{{OPENAI_API_KEY}}"` and set the env var at run-time.

## Next steps
- Run `review-agent-tools` next for the same scope.
- Re-run this skill after applying the DAG-MEM-001 fix.
```

## Sample report — `diagrid` wrapper

For an OpenAI Agents SDK project wrapped with `DaprWorkflowAgentRunner`, where `main.py` builds `DaprMemoryStore()` "to keep the conversation between calls" but never calls `save_memory` / `load_memory`, and `resources/` holds only `agent-workflow.yaml`:

```
# Dapr review — review-agent-memory

Target: /Users/x/support-bot
Language: python
Found: 0 critical, 1 warning, 1 suggestion, 0 to verify

## Warnings
- [DAG-MEM-012] `support-agent/main.py:20` — DaprMemoryStore() uses the default store `statestore`, not in resources/
  Why: resourcesPath replaces the dapr init components, so the first state call fails.
  Fix: Add `resources/agent-memory.yaml` and pass `DaprMemoryStore(store_name="agent-memory")`.

## Suggestions
- [DAG-MEM-011] `support-agent/main.py:20` — DaprMemoryStore is created but never read or written
  Why: The runner keeps history per workflow instance only; every /agent/run call starts fresh.
  Fix: Call `load_memory` / `save_memory` around each run, or drop the store and document per-run memory.

## Next steps
- Run `review-agent-observability` for the same scope.
- Run `review-agent-tools` next if not yet run.
```

Key points:

- The runner's `state_store=` and the auto-discovered `agent-memory` component are only published as registry metadata. They never hold conversation history, which is why DAG-MEM-011 is about helper stores and expectations, not about a missing `state_store=`.
- Wrapper projects need no `agent-memory` component unless the app's own code uses a helper store; its absence is not a finding.

## Retired rule ids

Retired ids stay reserved and are never reused.

- DAG-MEM-004 — retired for Python (memory and workflow keys cannot collide in `dapr-agents` 1.0.9: `{agent}:_memory_{instance}` vs `{agent}:_workflow_{instance}`). The .NET rule with this id is unchanged.
- DAG-MEM-005 — retired for Python (native memory is per workflow instance and moves to the state store whenever `state` is set; a missing `memory=` only matters when no state store is wired, which DAG-MEM-006 reports). The .NET rule with this id (session-less `RunAgentAsync`) is unchanged.
