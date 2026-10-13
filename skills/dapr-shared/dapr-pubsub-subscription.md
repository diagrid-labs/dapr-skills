# resources/subscription.yaml (declarative subscription)

## resources/subscription.yaml

```yaml
apiVersion: dapr.io/v2alpha1
kind: Subscription
metadata:
  name: <topic>-subscription
spec:
  pubsubname: <pubsub-name>
  topic: <topic>
  routes:
    default: <route-prefix>/<topic>
  deadLetterTopic: <dead-letter-topic>
scopes:
  - <subscriber-app-id>
---
apiVersion: dapr.io/v2alpha1
kind: Subscription
metadata:
  name: <dead-letter-topic>-subscription
spec:
  pubsubname: <pubsub-name>
  topic: <dead-letter-topic>
  routes:
    default: <route-prefix>/<dead-letter-topic>
scopes:
  - <subscriber-app-id>
```

## With routing rules

```yaml
  routes:
    rules:
      - match: int(event.data.amount) > 1000
        path: <route-prefix>/<topic>/large
    default: <route-prefix>/<topic>
```

## With raw payload

```yaml
spec:
  metadata:
    rawPayload: "true"
```

## Key points

- Defaults: `<pubsub-name>` = `pubsub`, `<topic>` = `orders`, `<dead-letter-topic>` = `orders-deadletter`, `<route-prefix>` = `/events/pubsub`.
- `<subscriber-app-id>` must equal the `appID` in `dapr.yaml`, or `DaprSidecarOptions.AppId` in Aspire, character for character. Otherwise the subscriber receives nothing.
- Every route path must exist as a POST endpoint in that app, because Dapr gets a 404 otherwise and **drops** the message.
- Declarative subscriptions hot-reload by default.
- `v1alpha1` is deprecated; use `v2alpha1`.
- Use `rawPayload`, never `isRawPayload` (the runtime ignores that key).
- Use `int()` in CEL comparisons, because JSON numbers are doubles.
- The file lives in the folder `dapr.yaml` `resourcesPath` points to, or in the AppHost `Resources/` folder in Aspire.
- Never also subscribe the same topic in code (`.WithTopic`, `[Topic]`, `DaprApp.subscribe`, `subscribe_with_handler`, `[DaprTopic]`).
- The file must ship with the app (for example `kubectl apply -f subscription.yaml`), because it is not part of the app's code.
