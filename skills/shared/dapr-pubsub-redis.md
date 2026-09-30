# resources/pubsub.yaml

Create a `pubsub.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: pubsub
spec:
  type: pubsub.redis
  version: v1
  metadata:
  - name: redisHost
    value: localhost:6379
  - name: redisPassword
    value: ""
```

- This example uses Redis, which is installed in a container when using the Dapr CLI (`dapr init`) — no separate pub/sub broker needs to be run.
- The component name `pubsub` is the value passed as the `pubSubName` argument to publish and subscribe calls.
- `redisPassword: ""` is safe only with `dapr init`'s local Redis container bound to `127.0.0.1`. Set a real password (e.g. via `secretKeyRef`) before exposing Redis beyond local development.
