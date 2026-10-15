# resources/subscription.yaml (declarative subscription)

This file uses its own kebab-case placeholders, which map onto the shared vocabulary in
[pubsub-placeholders.md](pubsub-placeholders.md): `<topic>` is `<TopicName>`, `<dead-letter-topic>` is
`<DeadLetterTopicName>`, and `<route-prefix>/<topic>` is `<SubscribeRoute>`. All of them come from the
specification interview; there is no default topic.

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
      - match: <MatchExpression>
        path: <route-prefix>/<topic>/<RuleName>
    default: <route-prefix>/<topic>
```

## With raw payload

```yaml
spec:
  metadata:
    rawPayload: "true"
```

## Key points

- Fixed values: `<pubsub-name>` = `pubsub`, `<route-prefix>` = `/events/pubsub`, and `<dead-letter-topic>` = `<topic>-deadletter`. `<topic>` itself comes from the interview and has no default.
- `<subscriber-app-id>` must equal the `appID` in `dapr.yaml`, or `DaprSidecarOptions.AppId` in Aspire, character for character. Otherwise the subscriber receives nothing.
- Every route path must exist as a POST endpoint in that app, because Dapr gets a 404 otherwise and **drops** the message.
- Declarative subscriptions hot-reload by default.
- `v1alpha1` is deprecated; use `v2alpha1`.
- Use `rawPayload`, never `isRawPayload` (the runtime ignores that key).
- Every numeric CEL comparison MUST wrap the field in `int()`, because JSON numbers are doubles and an uncast comparison never fires. `int()` truncates, so `int(event.data.amount) > 1000` does not match `1000.5`; pick the threshold accordingly. Do not use `double()` instead — see `pubsub-placeholders.md`.
- The file lives in the folder `dapr.yaml` `resourcesPath` points to, or in the AppHost `Resources/` folder in Aspire.
- Never also subscribe the same topic in code (`.WithTopic`, `[Topic]`, `DaprApp.subscribe`, `subscribe_with_handler`, `[DaprTopic]`).
- The file must ship with the app (for example `kubectl apply -f subscription.yaml`), because it is not part of the app's code.
