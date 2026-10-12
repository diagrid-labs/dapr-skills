# Agent Orchestration Checklist — Python

Apply each rule below to every file in `agent_files` + `component_files` when `topology == orchestrator`. When `topology == single-agent`, the review skill applies none of these rules (see `review-agent-orchestration/SKILL.md` step 2); the only rule that can fire then is `DAG-ORCH-010`, and only when `topology_unverified == true`.

Rule source: see [`../create-agent-python/REFERENCE.md`](../create-agent-python/REFERENCE.md) — sections "Multi-agent orchestration (native `dapr-agents`)" and "Wrapper `main.py` — the shape".

## Two code shapes, one rule set

Python multi-agent projects come in two flavors (`flavor` from `review-detect-target-agent.md`), and they wire topics and loop bounds in different places. Every rule below lists the detection for both; the rule id and its meaning are the same for both.

| Concern | `native` (`dapr-agents`) | `framework-wrapper` (`diagrid[<extra>]`) |
| --- | --- | --- |
| Inbound topic | `AgentPubSubConfig(agent_topic=...)` on `DurableAgent(pubsub=...)`; defaults to the agent `name` when omitted | `runner.serve(subscribe_topic=...)` |
| Outbound / team topic | `AgentPubSubConfig(broadcast_topic=...)` — coordinators (agents with `orchestration_mode` set) broadcast their final result to it | `runner.serve(publish_topic=...)` |
| Coordinator → specialist dispatch | Child workflow on the specialist's app id, looked up in the agent registry — no per-specialist topic | Publish to `<domain>.requests` |
| Loop bound | `DurableAgent(execution=AgentExecutionConfig(max_iterations=...))` (default `10`) | `DaprWorkflow*Runner(max_iterations=...)`; `max_steps=` on the graph-based runners (`DaprWorkflowGraphRunner`, `DaprWorkflowDeepAgentRunner`, `DaprWorkflowHolmesRunner`) |
| Registry | `registry=AgentRegistryConfig(...)`, or auto-wired from a component named exactly `agent-registry` when `registry=` is omitted | `registry_config=` on the runner |

## Rule-id map (Python vs .NET)

Rule ids are stable once published. Gaps in the id range mean the rule is implemented only on one side.

| Rule id      | Python | .NET | Notes                                                                 |
| ------------ | :----: | :--: | --------------------------------------------------------------------- |
| DAG-ORCH-001 |   ✓    |      | Python-specific — an agent's inbound topic collides with a topic it publishes to. |
| DAG-ORCH-002 |   ✓    |  ✓   | Loop bound (`max_iterations` / `max_steps` / `MaxIterations`).       |
| DAG-ORCH-003 |   ✓    |  ✓   | Topic naming convention `<domain>.(requests\|results)`.              |
| DAG-ORCH-004 |   ✓    |  ✓   | Coordinator references specialists not declared in `dapr.yaml`.      |
| DAG-ORCH-005 |   ✓    |  ✓   | Agent registry missing.                                              |
| DAG-ORCH-006 |   ✓    |      | Python-specific — module-level shared state across agents.           |
| DAG-ORCH-007 |   ✓    |  ✓   | Duplicate `appID`/port in `dapr.yaml`.                               |
| DAG-ORCH-008 |   ✓    |      | Python-specific — coordinator agent has no memory configuration.     |
| DAG-ORCH-009 |   ✓    |  ✓   | Redis component uses empty `redisPassword:` outside localhost.       |
| DAG-ORCH-010 |   ✓    |      | Python-specific — wrapper project classified single-agent with several entrypoints (`topology_unverified`). |

New .NET rules should reuse shared ids where semantics match; reserve Python-only ids and do not reassign them.

| Rule id      | Severity | What to detect                                                                                                                          | Why it matters                                                                                  | Suggested fix                                                                                |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| DAG-ORCH-001 | critical | An agent's inbound topic equals a topic it publishes to. **native:** `AgentPubSubConfig(...)` whose `agent_topic` equals its `broadcast_topic`. **wrapper:** `runner.serve(...)` whose `publish_topic` equals its `subscribe_topic` | Creates a pub/sub loop: the agent re-triggers itself (a native coordinator's own final broadcast lands on its direct-message topic and starts a new run; a wrapper specialist consumes its own results). | Keep the inbound topic distinct: `<domain>.requests` in, `<domain>.results` out (wrapper), or `agent_topic="<domain>.requests"` with `broadcast_topic="agents.broadcast"` (native). |
| DAG-ORCH-002 | warning  | The tool-call loop bound is not set explicitly. **native:** `DurableAgent(...)` without `execution=AgentExecutionConfig(...)`, or with an `AgentExecutionConfig(...)` that has no `max_iterations=`. **wrapper:** `DaprWorkflow*Runner(...)` without `max_iterations=` (or without `max_steps=` on `DaprWorkflowGraphRunner` / `DaprWorkflowDeepAgentRunner` / `DaprWorkflowHolmesRunner`) | The run falls back to a framework default that differs per framework and is invisible in review; a coordinator usually needs a different bound than its specialists. | Pass `execution=AgentExecutionConfig(max_iterations=<N>)` (native) or `max_iterations=<N>` / `max_steps=<N>` (wrapper); typical: 10–20. |
| DAG-ORCH-003 | warning  | A topic name does not match `<domain>.(requests\|results)` or `agents.broadcast`. **native:** `agent_topic=` / `broadcast_topic=` in `AgentPubSubConfig(...)`. **wrapper:** `publish_topic=` / `subscribe_topic=` in `runner.serve(...)` | Convention is `<domain>.requests`, `<domain>.results`, `agents.broadcast`. Other names fragment discovery and tooling.| Rename topics to match the convention.                                                       |
| DAG-ORCH-004 | warning  | Coordinator publishes to a topic whose `<domain>` prefix does not match any declared specialist `appID` in `dapr.yaml`. **wrapper:** the coordinator's `publish_topic=`. **Both flavors:** explicit publish calls (`DaprClient().publish_event(topic_name=...)`). Native registry-based dispatch has no per-specialist topic, so a native project without explicit publish calls has nothing to check | Coordinator sends work to a non-existent specialist; messages are dropped.                       | Ensure every targeted `<domain>` has a corresponding specialist app in `dapr.yaml`.           |
| DAG-ORCH-005 | critical (native coordinator) / info (otherwise) | No agent registry: `component_files` has no component named `agent-registry` **and** no agent file passes `AgentRegistryConfig(` (native) or `registry_config=` (wrapper). Severity is **critical** when a native `DurableAgent` sets `orchestration_mode=` (it is a coordinator); **info** for wrapper projects and native projects without a coordinator | A native coordinator looks up its team in the registry and fails with `RuntimeError: registry_state must be provided to use agent registry`. Without a registry, wrapper agents cannot discover each other and must be wired by static topics only. | Add `resources/agent-registry.yaml` with `keyPrefix: none` (see `dapr-shared/agent-statestore-registry.md`) and pass `registry=AgentRegistryConfig(...)` (native) or `registry_config=` (wrapper) explicitly. |
| DAG-ORCH-006 | warning  | A specialist agent imports module-level state shared with the coordinator via the filesystem / SQLite                                    | Cross-agent shared in-process state breaks durability and scaling guarantees.                    | Communicate only via pub/sub or a Dapr state store.                                          |
| DAG-ORCH-007 | warning  | `dapr.yaml` has two apps with the same `appID`, `appPort`, `daprHTTPPort`, or `daprGRPCPort`                                              | Port collisions prevent one or both sidecars from starting; invisible in the logs until timeout.| Assign each app a unique port per dimension.                                                  |
| DAG-ORCH-008 | info     | Coordinator agent has no memory configuration. **native:** `DurableAgent(...)` without `memory=` **and** no component named `agent-memory` in `component_files` (native agents auto-wire that component when `memory=` is omitted). **wrapper:** not checked — memory lives in the runner's `state_store` or the wrapped framework's own checkpointer | Coordinator loses context between workflow runs; usually unintended.                             | Add `memory=AgentMemoryConfig(store=ConversationDaprStateMemory(store_name="agent-memory"))`. |
| DAG-ORCH-009 | warning  | `agent-pubsub.yaml` / `agent-registry.yaml` / `agent-memory.yaml` / `agent-workflow.yaml` has `redisPassword: ""` AND the project references Redis endpoints other than `localhost` / `127.0.0.1` | Unauthenticated Redis outside localhost; any reachable process can publish to topics or read/write state. | Set `redisPassword` via `secretKeyRef`; configure Redis AUTH / ACLs; or pin `redisHost` to a loopback address in dev.|
| DAG-ORCH-010 | info     | `topology_unverified == true`: a `framework-wrapper` project has more than one agent entrypoint but no pub/sub marker, so it was classified `single-agent` | The wrapped framework may run a multi-agent pattern without Dapr pub/sub (CrewAI hierarchical crews, LangGraph subgraphs); a false single-agent classification silently skips every other rule here. | Confirm the project is single-agent. If the entrypoints are separate agents that talk to each other, wire them over `agent-pubsub` (`subscribe_topic=` / `publish_topic=` on `serve()`) and re-run this review. |

## Confidence notes

- DAG-ORCH-001 — On the native path, `agent_topic` defaults to the agent `name`; compare the effective values, not only the literal arguments.
- DAG-ORCH-003 — If the project intentionally uses a different naming scheme project-wide, downgrade to "Please verify". A native `AgentPubSubConfig(...)` without `agent_topic=` uses the agent `name` as its topic; report that as "Please verify", not as a warning.
- DAG-ORCH-004 — Requires reading both the coordinator file and `dapr.yaml`.
- DAG-ORCH-010 — Always reported under "Please verify", never under a graded severity section. Cite the `dapr.yaml` (or the first entrypoint) as the location.

## Cross-reference

Tool-level rules: `review-agent-tools-python.md`. Memory/state-store rules: `review-agent-memory-python.md`.
