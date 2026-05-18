# resources/agent-memory.yaml

> **WARNING:** The `redisPassword: ""` below is safe **only** with `dapr init`'s local Redis container (bound to `127.0.0.1`). Before running in any shared environment, set a password via `secretKeyRef` and configure Redis AUTH / ACLs.

Dapr Agents persists conversation history in a Dapr state store component named `agent-memory`. Create a `resources` folder in the project root with an `agent-memory.yaml` file:

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

- The component name `agent-memory` is the value passed to `ConversationDaprStateMemory(store_name="agent-memory")` in the agent code.
- `actorStateStore` is `"false"` because conversation memory does **not** use the actor framework. It must not be the same component as the workflow state store.
- This example uses Redis, which is installed in a container when using the Dapr CLI (`dapr init`).
- Redis connection fields (`redisHost`, `redisPassword`) mirror the sibling state-store files (`agent-statestore-workflow.md`, `agent-statestore-registry.md`) and the pub/sub file (`agent-pubsub-redis.md`). Update them together if you change the host or password.

### Retention

Conversation history persists **indefinitely** in the state store by default. For production:

- Set a Redis `EXPIRE` policy on the memory-key namespace, or
- Set a `maxmemory-policy` on the Redis instance (e.g. `allkeys-lru`), or
- Use a state-store-level TTL if your Dapr component exposes one.

If the agent handles regulated data (PII, healthcare, financial), define a data retention policy *before* enabling production traffic. Conversation memory is the single largest secondary store of user task text in the agent pipeline.
