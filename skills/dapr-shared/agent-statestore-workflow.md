# resources/agent-workflow.yaml

> **WARNING:** The `redisPassword: ""` below is safe **only** with `dapr init`'s local Redis container (bound to `127.0.0.1`). Before running in any shared environment, set a password via `secretKeyRef` and configure Redis AUTH / ACLs.

Durable agents run on top of Dapr Workflow, which requires an actor-enabled state store. This component is required on both the Python and the .NET path. Create an `agent-workflow.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: agent-workflow
spec:
  type: state.redis
  version: v1
  metadata:
  - name: redisHost
    value: localhost:6379
  - name: redisPassword
    value: ""
  - name: actorStateStore
    value: "true"
```

- Python native: the component name `agent-workflow` is the value passed to `StateStoreService(store_name="agent-workflow")` in the agent code (`DurableAgent` also auto-wires a component with exactly this name when `state=` is omitted). Python `diagrid` wrappers and .NET: no code references the name — Dapr Workflow uses whichever component in `resources/` has `actorStateStore: "true"`.
- `actorStateStore` **must** be `"true"` because Dapr Workflow uses the actor framework internally. Without this, workflow execution will fail at runtime.
- Python native: in `dapr-agents` 1.0.9 the agent also writes its conversation memory to this store (one key per workflow instance, `<agent-name>:_memory_<instance-id>`), replacing any `memory=` argument, so the scaffold has no separate `agent-memory` component. Python wrappers keep the conversation of a run in the workflow history, which also lives in this store. .NET: there is no `agent-memory` component either, and the conversation history of a session lives in the session workflow's state, i.e. in this store.
- Redis connection fields (`redisHost`, `redisPassword`) mirror the sibling state-store files (`agent-statestore-memory.md`, `agent-statestore-registry.md`) and the pub/sub file (`agent-pubsub-redis.md`). Update them together if you change the host or password.
