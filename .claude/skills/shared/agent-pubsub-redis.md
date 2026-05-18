# resources/agent-pubsub.yaml

> **WARNING:** The `redisPassword: ""` below is safe **only** with `dapr init`'s local Redis container (bound to `127.0.0.1`). Before exposing Redis on any shared network, docker-compose network, or VM with Redis reachable on `0.0.0.0`, set a password via `secretKeyRef` and configure Redis AUTH / ACLs. Pub/sub delivery is structurally unauthenticated at the protocol level: anyone who can reach Redis can publish or subscribe to any topic, including `coordinator.results` and `agents.broadcast`.

Multi-agent systems exchange work via a pub/sub component named `agent-pubsub`. Only needed when the project has more than one agent. Create an `agent-pubsub.yaml` component in the `resources` folder:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: agent-pubsub
spec:
  type: pubsub.redis
  version: v1
  metadata:
  - name: redisHost
    value: localhost:6379
  - name: redisPassword
    value: ""
```

- The component name `agent-pubsub` is the value passed to `pubsub_name="agent-pubsub"` on `runner.serve(...)`.
- Every specialist agent subscribes to its own `<domain>.requests` topic and publishes to `<domain>.results`.
- The coordinator also publishes a broadcast on the `agents.broadcast` topic so agents discover each other via the registry.
- For single-agent projects, omit this file entirely.
