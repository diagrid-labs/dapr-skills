# Reference: review-agent-orchestration

## Sample report

For a multi-agent project where `VenueScout` publishes to `venue.requests` (its own subscription topic) and the coordinator's `DaprWorkflowAgentRunner` has no `max_iterations`:

```
# Dapr review — review-agent-orchestration

Target: /Users/x/my-agents
Language: python
Found: 1 critical, 1 warning, 1 suggestion, 0 to verify

## Critical
- [DAG-ORCH-001] `venue/main.py:22` — specialist publishes to its own subscription topic
  Why: Creates a pub/sub loop — the specialist triggers itself repeatedly.
  Fix: Change publish_topic to `venue.results` and keep subscribe_topic as `venue.requests`.

## Warnings
- [DAG-ORCH-002] `coordinator/main.py:15` — DaprWorkflowAgentRunner has no max_iterations
  Why: Agent runs can loop unboundedly when the LLM keeps calling tools.
  Fix: Pass max_iterations=10 to bound the tool-call loop.

## Suggestions
- [DAG-ORCH-005] `resources/` — agent-registry.yaml component not found
  Why: Agents cannot discover each other dynamically; they must be wired by static config only.
  Fix: Add agent-registry.yaml with keyPrefix: none (see shared/agent-statestore-registry.md).

## Next steps
- Run `review-agent-memory` next for the same scope.
- Re-run this skill after fixing DAG-ORCH-001.
```
