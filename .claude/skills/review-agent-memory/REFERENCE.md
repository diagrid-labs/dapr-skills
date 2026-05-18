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
  Why: Dapr Workflow is built on actors; without the flag the workflow engine will not run.
  Fix: Add `- name: actorStateStore\n    value: "true"` in the component metadata.

## Warnings
- [DAG-MEM-003] `resources/llm-provider.yaml:10` — OPENAI_API_KEY hardcoded as value
  Why: Leaks the key into source control and log output.
  Fix: Replace with `value: "{{OPENAI_API_KEY}}"` and set the env var at run-time.

## Next steps
- Run `review-agent-tools` next for the same scope.
- Re-run this skill after applying the DAG-MEM-001 fix.
```
