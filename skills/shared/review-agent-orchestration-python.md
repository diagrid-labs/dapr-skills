# Agent Orchestration Checklist — Python

Apply each rule below to every file in `agent_files` + `component_files` when `topology == orchestrator`. If `topology == single-agent`, the review skill is silent and returns zero findings.

Rule source: see [`../create-agent-python/REFERENCE.md`](../create-agent-python/REFERENCE.md) — section "Multi-agent orchestration".

## Rule-id map (Python vs .NET)

Rule ids are stable once published. Gaps in the id range mean the rule is implemented only on one side.

| Rule id      | Python | .NET | Notes                                                                 |
| ------------ | :----: | :--: | --------------------------------------------------------------------- |
| DAG-ORCH-001 |   ✓    |      | Python-specific — relies on `runner.serve(publish_topic/subscribe_topic)` arguments. |
| DAG-ORCH-002 |   ✓    |  ✓   | `max_iterations` / `MaxIterations` loop bound.                       |
| DAG-ORCH-003 |   ✓    |  ✓   | Topic naming convention `<domain>.(requests\|results)`.              |
| DAG-ORCH-004 |   ✓    |  ✓   | Coordinator references specialists not declared in `dapr.yaml`.      |
| DAG-ORCH-005 |   ✓    |  ✓   | `agent-registry.yaml` component missing.                             |
| DAG-ORCH-006 |   ✓    |      | Python-specific — module-level shared state across agents.           |
| DAG-ORCH-007 |   ✓    |  ✓   | Duplicate `appID`/port in `dapr.yaml`.                               |
| DAG-ORCH-008 |   ✓    |      | Python-specific — coordinator agent has no `memory=` keyword.        |
| DAG-ORCH-009 |   ✓    |  ✓   | Redis component uses empty `redisPassword:` outside localhost.       |

New .NET rules should reuse shared ids where semantics match; reserve Python-only ids and do not reassign them.

| Rule id      | Severity | What to detect                                                                                                                          | Why it matters                                                                                  | Suggested fix                                                                                |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| DAG-ORCH-001 | critical | A specialist agent's `publish_topic=...` equals its own `subscribe_topic=...` on `runner.serve(...)`                                     | Creates a pub/sub loop: the specialist triggers itself repeatedly.                               | Publish to `<domain>.results` and subscribe to `<domain>.requests` (distinct topics).         |
| DAG-ORCH-002 | warning  | `DaprWorkflow*Runner(...)` constructed without a `max_iterations=` kwarg                                                                  | Agent runs can loop unboundedly when the LLM keeps calling tools.                                | Pass `max_iterations=<N>` (typical: 10–20) to bound the tool-call loop.                      |
| DAG-ORCH-003 | warning  | A topic name used in `publish_topic` / `subscribe_topic` does not match `<domain>.(requests\|results)` or `agents.broadcast`              | Convention is `<domain>.requests`, `<domain>.results`, `agents.broadcast`. Other names fragment discovery and tooling.| Rename topics to match the convention.                                                       |
| DAG-ORCH-004 | warning  | Coordinator publishes to a topic whose `<domain>` prefix does not match any declared specialist `appID` in `dapr.yaml`                    | Coordinator sends work to a non-existent specialist; messages are dropped.                       | Ensure every targeted `<domain>` has a corresponding specialist app in `dapr.yaml`.           |
| DAG-ORCH-005 | info     | Project lacks a `resources/agent-registry.yaml` component                                                                                 | Agents cannot discover each other dynamically; they must be wired by static config only.        | Add `agent-registry.yaml` with `keyPrefix: none` (see `shared/agent-statestore-registry.md`). |
| DAG-ORCH-006 | warning  | A specialist agent imports module-level state shared with the coordinator via the filesystem / SQLite                                    | Cross-agent shared in-process state breaks durability and scaling guarantees.                    | Communicate only via pub/sub or a Dapr state store.                                          |
| DAG-ORCH-007 | warning  | `dapr.yaml` has two apps with the same `appID`, `appPort`, `daprHTTPPort`, or `daprGRPCPort`                                              | Port collisions prevent one or both sidecars from starting; invisible in the logs until timeout.| Assign each app a unique port per dimension.                                                  |
| DAG-ORCH-008 | info     | Coordinator agent has no `memory=` configuration                                                                                           | Coordinator loses context between workflow runs; usually unintended.                             | Add `memory=AgentMemoryConfig(...)`.                                                         |
| DAG-ORCH-009 | warning  | `agent-pubsub.yaml` / `agent-registry.yaml` / `agent-memory.yaml` / `agent-workflow.yaml` has `redisPassword: ""` AND the project references Redis endpoints other than `localhost` / `127.0.0.1` | Unauthenticated Redis outside localhost; any reachable process can publish to topics or read/write state. | Set `redisPassword` via `secretKeyRef`; configure Redis AUTH / ACLs; or pin `redisHost` to a loopback address in dev.|

## Confidence notes

- DAG-ORCH-003 — If the project intentionally uses a different naming scheme project-wide, downgrade to "Please verify".
- DAG-ORCH-004 — Requires reading both the coordinator file and `dapr.yaml`.

## Cross-reference

Tool-level rules: `review-agent-tools-python.md`. Memory/state-store rules: `review-agent-memory-python.md`.
