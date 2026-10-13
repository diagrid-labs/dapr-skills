# resources/agent-pubsub.yaml

> **WARNING:** The `redisPassword: ""` below is safe **only** with `dapr init`'s local Redis container (bound to `127.0.0.1`). Before exposing Redis on any shared network, docker-compose network, or VM with Redis reachable on `0.0.0.0`, set a password via `secretKeyRef` and configure Redis AUTH / ACLs. Pub/sub delivery is structurally unauthenticated at the protocol level: anyone who can reach Redis can publish or subscribe to any topic, including `<name>.topic` and `agents.broadcast`.

Multi-agent Python systems use a pub/sub component named `agent-pubsub` for agent topics and team broadcasts. Only needed when the project has more than one native agent, or uses `diagrid` wrappers in the event-driven variant. Create an `agent-pubsub.yaml` component in the `resources` folder:

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

- Native `dapr-agents`: the component name goes on the agent, `pubsub=AgentPubSubConfig(pubsub_name="agent-pubsub", agent_topic="<name>.topic", broadcast_topic="agents.broadcast")`, not on `runner.serve()`. These topic names are also what `DurableAgent` auto-wires when it finds a component named exactly `agent-pubsub` and no `pubsub=` is passed (`<name>` lower-cased, spaces turned into dashes).
- Native: each agent can be triggered on its own `<name>.topic`. When the coordinator finishes, it broadcasts its final result on `agents.broadcast`, and the other agents record it in their memory. Coordinator → specialist dispatch does **not** use pub/sub: it is a child workflow on the specialist's app, found through `agent-registry`.
- `diagrid` wrappers: `pubsub_name="agent-pubsub"` goes on `runner.serve(...)` together with `subscribe_topic=` and `publish_topic=` (the event-driven variant; `<domain>.requests` / `<domain>.results` is a naming suggestion). Without `pubsub_name` the topic arguments are ignored, and `serve()` never uses a discovered `agent-pubsub` on its own.
- For single-agent projects, and for a native coordinator with wrapper specialists, omit this file.
- .NET: the `create-agent-dotnet` multi-agent topologies (in-process workflow, or separate apps called via service invocation) do not use pub/sub, so this file is not part of the .NET scaffold. If you add pub/sub yourself, publishing needs the `Dapr.Client` package, and subscribers need `Dapr.AspNetCore` with `app.UseCloudEvents()` (and `app.MapSubscribeHandler()` for programmatic subscriptions) to unwrap the CloudEvent envelope.
