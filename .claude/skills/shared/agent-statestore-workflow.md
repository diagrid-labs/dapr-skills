# resources/agent-workflow.yaml

> **WARNING:** The `redisPassword: ""` below is safe **only** with `dapr init`'s local Redis container (bound to `127.0.0.1`). Before running in any shared environment, set a password via `secretKeyRef` and configure Redis AUTH / ACLs.

Dapr Agents runs on top of Dapr Workflow, which requires an actor-enabled state store. Create an `agent-workflow.yaml` component in the `resources` folder:

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

- The component name `agent-workflow` is the value passed to `StateStoreService(store_name="agent-workflow")` in the agent code.
- `actorStateStore` **must** be `"true"` because Dapr Workflow uses the actor framework internally. Without this, workflow execution will fail at runtime.
- Do not reuse this component for conversation memory — keep the two separate so the workflow state and the chat history have independent lifecycles.
- Redis connection fields (`redisHost`, `redisPassword`) mirror the sibling state-store files (`agent-statestore-memory.md`, `agent-statestore-registry.md`) and the pub/sub file (`agent-pubsub-redis.md`). Update them together if you change the host or password.
