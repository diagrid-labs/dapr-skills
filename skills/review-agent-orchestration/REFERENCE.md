# Reference: review-agent-orchestration

## Sample report — framework wrapper

For a `diagrid[openai-agents]` project with `coordinator/`, `venue/` and `catering/` entrypoints and a `resources/agent-pubsub.yaml` but no `agent-registry.yaml` (topology `orchestrator` — the registry is not required for that), where `VenueScout` publishes to `venue.requests` (its own subscription topic) and the coordinator's `DaprWorkflowAgentRunner` has no `max_iterations`:

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
  Why: The loop bound falls back to a framework default that is invisible in review.
  Fix: Pass max_iterations=20 to the runner.

## Suggestions
- [DAG-ORCH-005] `resources/` — no agent-registry component and no registry_config= on any runner
  Why: Agents cannot discover each other dynamically; they must be wired by static topics only.
  Fix: Add agent-registry.yaml with keyPrefix: none (see dapr-shared/agent-statestore-registry.md).

## Next steps
- Run `review-agent-memory` next for the same scope.
- Re-run this skill after fixing DAG-ORCH-001.
```

## Sample report — native `dapr-agents`

For a native project with `coordinator/` and `venue/` entrypoints and a `resources/agent-pubsub.yaml` but no `agent-registry.yaml`. The coordinator sets `execution=AgentExecutionConfig(orchestration_mode=OrchestrationMode.AGENT)` without `max_iterations=`, and its `AgentPubSubConfig` uses `agent_topic="agents.broadcast"` and `broadcast_topic="agents.broadcast"`:

```
# Dapr review — review-agent-orchestration

Target: /Users/x/my-agents
Language: python
Found: 2 critical, 1 warning, 0 suggestions, 0 to verify

## Critical
- [DAG-ORCH-001] `coordinator/main.py:31` — agent_topic equals broadcast_topic (`agents.broadcast`)
  Why: The coordinator's final broadcast lands on its own direct-message topic and starts a new run.
  Fix: Set agent_topic="coordinator.requests" and keep broadcast_topic="agents.broadcast".
- [DAG-ORCH-005] `coordinator/main.py:35` — coordinator sets orchestration_mode but no agent registry is configured
  Why: The coordinator fails with RuntimeError: registry_state must be provided to use agent registry.
  Fix: Add resources/agent-registry.yaml (keyPrefix: none) and pass registry=AgentRegistryConfig(...).

## Warnings
- [DAG-ORCH-002] `coordinator/main.py:35` — AgentExecutionConfig has no max_iterations
  Why: The loop bound falls back to the framework default (10) and is invisible in review.
  Fix: Pass AgentExecutionConfig(orchestration_mode=..., max_iterations=20).

## Next steps
- Run `review-agent-memory` next for the same scope.
- Re-run this skill after fixing DAG-ORCH-001 and DAG-ORCH-005.
```

## Uncertain single-agent wrapper

For a `diagrid[crewai]` project with two entrypoints and no pub/sub marker, `review-detect-target-agent.md` sets `topology_unverified: true`. The report body is one entry:

```
## Please verify
- [DAG-ORCH-010] `dapr.yaml:7` — two agent entrypoints but no pub/sub wiring; confirm the project is single-agent
```
