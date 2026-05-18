# resources/statestore.yaml

Dapr Workflow requires a state store component. Create a `resources` folder in the project root with a `statestore.yaml` file:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: statestore
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

- The state store is required for workflow state persistence.
- `actorStateStore` must be set to `"true"` because Dapr Workflow uses the actor framework internally.
- This example uses Redis, which is installed in a container when using the Dapr CLI (`dapr init`).
