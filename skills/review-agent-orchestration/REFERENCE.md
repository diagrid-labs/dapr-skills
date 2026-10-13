# Reference: review-agent-orchestration

## Sample report — framework wrapper

For a `diagrid[openai-agents]` project with `coordinator/`, `venue/` and `catering/` entrypoints and a `resources/agent-pubsub.yaml` but no `agent-registry.yaml` (topology `orchestrator` — the registry is not required for that), where `VenueScout` publishes to `venue.requests` (its own subscription topic), the coordinator's `DaprWorkflowAgentRunner` has no `max_iterations`, and every `serve(...)` passes `pubsub_name="agent-pubsub"`. The missing registry is not reported: wrappers never look agents up, so `DAG-ORCH-005` does not apply to a wrapper-only project.

```
# Dapr review — review-agent-orchestration

Target: /Users/x/my-agents
Language: python
Found: 1 critical, 1 warning, 0 suggestions, 1 to verify

## Critical
- [DAG-ORCH-001] `venue/main.py:22` — specialist publishes to its own subscription topic
  Why: Creates a pub/sub loop — the specialist receives its own result as a new task.
  Fix: Change publish_topic to `venue.results` and keep subscribe_topic as `venue.requests`.

## Warnings
- [DAG-ORCH-002] `coordinator/main.py:15` — DaprWorkflowAgentRunner has no max_iterations
  Why: The loop bound falls back to the openai_agents default (25), which is invisible in review.
  Fix: Pass max_iterations=20 to the runner.

## Please verify
- [DAG-ORCH-012] `coordinator/main.py:17` — serve() subscribes to pub/sub (also venue/main.py, catering/main.py)
  Verify: each delivery runs the agent in the request, so a redelivery starts a duplicate run; confirm that is acceptable.

## Next steps
- Run `review-agent-memory` and `review-agent-observability` next for the same scope.
- Re-run this skill after fixing DAG-ORCH-001.
```

## Sample report — native `dapr-agents`

For a native project with `coordinator/` and `venue/` entrypoints (the coordinator is named `PartyCoordinator`) and a `resources/agent-pubsub.yaml` but no `agent-registry.yaml`. The coordinator sets `execution=AgentExecutionConfig(orchestration_mode=OrchestrationMode.AGENT)` without `max_iterations=`, and its `AgentPubSubConfig` uses `agent_topic="agents.broadcast"` and `broadcast_topic="agents.broadcast"`:

```
# Dapr review — review-agent-orchestration

Target: /Users/x/my-agents
Language: python
Found: 2 critical, 1 warning, 0 suggestions, 0 to verify

## Critical
- [DAG-ORCH-001] `coordinator/main.py:31` — agent_topic equals broadcast_topic (`agents.broadcast`)
  Why: The coordinator's final broadcast lands on its own direct-message topic and starts a new run.
  Fix: Set agent_topic="partycoordinator.topic" and keep broadcast_topic="agents.broadcast".
- [DAG-ORCH-005] `coordinator/main.py:35` — coordinator sets orchestration_mode but no agent registry is configured
  Why: The coordinator fails with RuntimeError: registry_state must be provided to use agent registry.
  Fix: Add resources/agent-registry.yaml (keyPrefix: none) and pass registry=AgentRegistryConfig(...).

## Warnings
- [DAG-ORCH-002] `coordinator/main.py:35` — AgentExecutionConfig has no max_iterations
  Why: The loop bound falls back to the framework default (10) and is invisible in review.
  Fix: Pass AgentExecutionConfig(orchestration_mode=..., max_iterations=20).

## Next steps
- Run `review-agent-memory` and `review-agent-observability` next for the same scope.
- Re-run this skill after fixing DAG-ORCH-001 and DAG-ORCH-005.
```

## Uncertain single-agent wrapper

For a `diagrid[crewai]` project with two entrypoints and no pub/sub marker, `review-detect-target-agent.md` sets `topology_unverified: true`. The report body is one entry:

```
## Please verify
- [DAG-ORCH-010] `dapr.yaml:7` — two agent entrypoints but no pub/sub wiring
  Verify: confirm the project is single-agent; if the agents hand work to each other, add the wiring and re-run.
```

## Mixed team: native coordinator with wrapper specialists

For a `mixed` project whose `coordinator/main.py` imports `dapr_agents` and sets `orchestration_mode=`, and whose `researcher/main.py` imports `diagrid.agent.langgraph`, each file is checked by its own flavor: `DAG-ORCH-002` looks for `max_iterations=` in the coordinator's `AgentExecutionConfig` and for `max_steps=` on the researcher's `DaprWorkflowGraphRunner`. If `agent-registry.yaml` is missing, the coordinator gets `DAG-ORCH-005` (critical) and the researcher gets:

```
## Please verify
- [DAG-ORCH-014] `researcher/main.py:18` — wrapper specialist has no agent-registry component or registry_config=
  Verify: confirm the coordinator can find it in the registry (end-to-end native→wrapper dispatch is not yet verified).
```

## Retired rules

- DAG-ORCH-008 — retired (the "coordinator loses context between runs" premise is false: `dapr-agents` 1.0.9 keys memory per workflow instance and replaces an explicit `memory=` with state-store memory whenever `state=` is set or `agent-workflow` is auto-wired; in-run memory is covered by `review-agent-memory`). The id stays reserved and is never emitted.
