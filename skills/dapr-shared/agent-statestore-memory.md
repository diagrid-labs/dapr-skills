# resources/agent-memory.yaml

> **WARNING:** The `redisPassword: ""` below is safe **only** with `dapr init`'s local Redis container (bound to `127.0.0.1`). Before running in any shared environment, set a password via `secretKeyRef` and configure Redis AUTH / ACLs.

**The `create-agent-*` scaffolds do not generate this file.** In `dapr-agents` 1.0.9 a native `DurableAgent` that has a `state=` store (passed explicitly, or auto-wired from a component named `agent-workflow`) writes its conversation memory to **that** store and replaces any `memory=` argument, so an `agent-memory` component is unused. `diagrid` wrapper runners do not read or write conversation history through a state store either. (.NET agents built on Microsoft Agent Framework do not use this component — their session turns live in the workflow state store.)

Add an `agent-memory` component only when code actually uses it: a native agent run **without** a state store (it then auto-wires a component named exactly `agent-memory`), or a `diagrid` framework memory helper whose store name is `agent-memory` (the `langgraph` and `strands` helpers default to it; the others default to `statestore`). In that case, create an `agent-memory.yaml` file in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: agent-memory
spec:
  type: state.redis
  version: v1
  metadata:
  - name: redisHost
    value: localhost:6379
  - name: redisPassword
    value: ""
  - name: actorStateStore
    value: "false"
```

- The component name `agent-memory` is the store name the code uses (the native auto-wiring, or the helper's `store_name=`).
- `actorStateStore` is `"false"` because conversation memory does **not** use the actor framework, and only one component may be the actor state store.
- Native memory is keyed per workflow instance (`<agent-name>:_memory_<instance-id>`), so it holds the history of one run, not of a user across runs, whichever store it is in.
- This example uses Redis, which is installed in a container when using the Dapr CLI (`dapr init`).
- Redis connection fields (`redisHost`, `redisPassword`) mirror the sibling state-store files (`agent-statestore-workflow.md`, `agent-statestore-registry.md`) and the pub/sub file (`agent-pubsub-redis.md`). Update them together if you change the host or password.

### Retention

Conversation history persists **indefinitely** in whichever state store holds it (for native agents in 1.0.9, usually the workflow store) until the instance is purged. For production:

- Set a Redis `EXPIRE` policy on the memory-key namespace, or
- Set a `maxmemory-policy` on the Redis instance (e.g. `allkeys-lru`), or
- Use a state-store-level TTL if your Dapr component exposes one.

If the agent handles regulated data (PII, healthcare, financial), define a data retention policy *before* enabling production traffic. Conversation memory is the single largest secondary store of user task text in the agent pipeline.
