# Dapr pub/sub concepts

Background note for the create, add and review pub/sub skills (`create-pubsub-*`, `add-pubsub-*`, `review-pubsub-*`). It collects the runtime facts the skills rely on, so the skill files can stay short. Where the Dapr docs disagree with the runtime or the API reference, the statement here follows the API reference and the runtime checks done before these skills were written.

## Delivery guarantees and idempotency

- Dapr pub/sub delivers each message **at least once**.
- Dapr does not deduplicate. A message can arrive twice after a retry, a restart, or a broker redelivery.
- Subscribers must be idempotent. Deduplicate on the CloudEvent `id` (together with `source`), or on the business key the message carries (`<IdProperty>`).
- A publisher that retries creates a second message with a new CloudEvent `id`, so the business key is the only reliable dedupe key.

Source: developing-applications/building-blocks/pubsub/pubsub-overview.md; developing-applications/building-blocks/pubsub/pubsub-cloudevents.md

## CloudEvents envelope

- Dapr wraps every published payload in a CloudEvent. The fields Dapr sets are `id`, `source`, `specversion`, `type`, `traceparent`, `traceid`, `tracestate`, `topic`, `pubsubname`, `time` and `datacontenttype`.
- HTTP delivery to the app uses `Content-Type: application/cloudevents+json`, for every subscription type that pushes over HTTP.
- .NET: `app.UseCloudEvents()` replaces the request body with the envelope's `data`, so a plain endpoint can bind `<EventName>`. Without it, a typed endpoint binds the envelope and every field is null or default.
- Python: FastAPI parses the `+json` body. A plain route taking `event: dict = Body(...)` receives the whole envelope, and the handler reads `event["data"]`.
- Never override the `cloudevent.trace*` metadata keys on publish. They carry the trace context.

Source: developing-applications/building-blocks/pubsub/pubsub-cloudevents.md

## Subscriber responses

The app tells the sidecar what to do with a message through its HTTP response.

| App response | Dapr does |
|---|---|
| 2xx, empty body or no `status` | success |
| 2xx `{"status":"SUCCESS"}` | success |
| 2xx `{"status":"RETRY"}` | retry |
| 2xx `{"status":"DROP"}` | log a warning, drop |
| 2xx with any other `status` | retry |
| 404 | log an error, **drop** |
| any other non-2xx | retry |

With a dead-letter topic configured, DROP also forwards the message to it (see Dead-letter topics and retries).

- `howto-publish-subscribe.md` contradicts the 404 row. `reference/api/pubsub_api.md` is authoritative.
- A missing route therefore loses messages. Every route in a Subscription must exist as a POST endpoint.
- Streaming subscriptions answer through the SDK instead (.NET `TopicResponseAction`, Python `TopicEventResponse("success" | "retry" | "drop")`). Every streaming message must be answered.
- Python: `TopicEventResponse("fail")` is not a valid status and raises `KeyError`. Use `"retry"` or `"drop"`.

Source: reference/api/pubsub_api.md; developing-applications/building-blocks/pubsub/subscription-methods.md

## Dead-letter topics and retries

- With a dead-letter topic and no retry policy, a failing message goes to the dead-letter topic immediately, without a single retry.
- Always pair a dead-letter topic with an inbound retry policy: see `dapr-pubsub-resiliency.md`.
- The dead-letter topic needs its own subscription (and its own route for HTTP delivery), otherwise the dead-lettered messages are never read.
- The runtime docs do not say that DROP dead-letters. **Verified at runtime** (.NET HTTP and Python streaming): a DROP response is not redelivered, but when a dead-letter topic is configured the message is also forwarded to it; without a dead-letter topic it is discarded. Never describe DROP as silently discarded when a dead-letter topic exists.
- A payload that cannot be parsed by the sidecar (for example a malformed raw payload) is sent to the dead-letter topic if one is set, and never reaches the app.
- .NET streaming (`Dapr.Messaging`): the body is deserialized in generated code before the handler runs. A body that cannot be deserialized to the message type faults the stream and is redelivered after each reconnect, so one poison message delays the later ones. The handler can only Drop messages that are well-formed JSON but semantically invalid (a missing `<IdProperty>`, a quantity that must be positive); it cannot Drop malformed JSON. Keep the contract lenient (nullable members) and rely on the sidecar's retry and dead-letter policy.

> Not verified at runtime: the Python scenarios ran on the in-memory pub/sub component, not Redis (consumer groups, redelivery timing after a restart, exact retry timing).

Source: developing-applications/building-blocks/pubsub/pubsub-deadletter.md; operations/resiliency/targets.md

## Message TTL

- The publisher sets the `ttlInSeconds` metadata, and the value is a **string** (`"60"`). It works on every component, because Dapr stamps an `expiration` into the CloudEvent.
- Python: `publish_metadata={"ttlInSeconds": "60"}`. An int value raises `TypeError`.
- Dapr subscribers drop expired messages. A non-Dapr subscriber must check the CloudEvent `expiration` itself.

Source: developing-applications/building-blocks/pubsub/pubsub-message-ttl.md

## Raw payload

- The metadata key is **`rawPayload`**, for both publish and subscribe, in every language.
- The Dapr docs show `isRawPayload` in a declarative example and in the .NET description. The runtime ignores that key (`components-contrib/metadata/utils.go`: `RawPayloadKey = "rawPayload"`). A subscriber that expects raw bytes then silently receives a CloudEvent. Verified: with `isRawPayload` the .NET handler got a non-raw body.
- The subscriber's sidecar wraps the raw bytes as a CloudEvent with `data_base64` and `datacontenttype: application/octet-stream`. .NET `UseCloudEvents()` decodes `data_base64` into the request body. Python declarative and programmatic handlers base64-decode `event["data_base64"]`. Python streaming handlers use `message.raw_data()`.
- A raw subscription expects raw publishers. When a CloudEvent publisher feeds a raw subscription, a Python streaming handler's `raw_data()` is the full CloudEvent JSON envelope.
- Raw payloads lose tracing, the dedupe id and the content type.

Source: developing-applications/building-blocks/pubsub/pubsub-raw.md

## Content-based routing

- A CEL `match` expression sees the CloudEvent as `event`, for example `event.data.amount`.
- JSON numbers are doubles, so compare with `int(event.data.amount) > 1000`. The cast truncates, so `1000.5` does not satisfy `> 1000`. `int()` is the required form; `double()` is not used, so routing stays consistent across projects.
- Only nested JSON data is addressable. There are no time comparisons.
- Rules live in `routes.rules` (declarative) or in `TopicOptions.Match` / `[Topic(..., match, priority)]` (.NET programmatic). Each rule needs its own POST endpoint, plus the `default` route.
- There is no routing for streaming subscriptions, and none in `dapr-ext-fastapi`. Python routing is done declaratively.

Source: developing-applications/building-blocks/pubsub/howto-route-messages.md

## Consumer groups and scopes

- The consumer group defaults to the app-id, so replicas of one app compete for messages, and different apps each get every message.
- A fixed `consumerID` shared by several apps makes those apps compete. Use `{appID}` in the value, or leave it unset.
- Component `scopes` limit which app-ids load the component. `publishingScopes`, `subscriptionScopes`, `allowedTopics` and `protectedTopics` limit what an app can publish or subscribe.
- A Subscription's own `scopes` limit which app-ids load that subscription. They must match the app-id exactly.
- A new consumer group on a topic that already has history receives the old messages (observed on Redis).

Source: developing-applications/building-blocks/pubsub/pubsub-scopes.md; operations/components/setup-pubsub/_index.md

## Subscription types

| Type | Defined in | App endpoint needed | `appPort` needed | Hot reload | .NET API | Python API |
|---|---|---|---|---|---|---|
| Declarative (default) | `resources/subscription.yaml` (`dapr.io/v2alpha1`) | Yes, plain POST routes | Yes | Yes, by default | Plain minimal API / controller endpoint plus `app.UseCloudEvents()`; no `MapSubscribeHandler`, `WithTopic` or `[Topic]` | Plain FastAPI `@app.post` routes; no `DaprApp`, no Dapr package in the subscriber |
| Programmatic | App code, advertised on `GET /dapr/subscribe` | Yes | Yes | No, read once at app start-up | `UseCloudEvents()`, `MapSubscribeHandler()`, then `.WithTopic(...)` or `[Topic(...)]` (`Dapr.AspNetCore`) | `DaprApp(app).subscribe(...)` (`dapr-ext-fastapi`) |
| Streaming | App code; the app opens a gRPC stream to its sidecar | No | No (create skills omit it; add skills keep the existing one) | Dynamic in code, not used by the scaffold | `Dapr.Messaging`: `AddDaprMessaging(...)` and an `ITopicHandler<T>` with `[DaprTopic(..., Delivery = DeliveryMode.Streaming)]` | `DaprClient().subscribe_with_handler(...)` (`dapr`) |

- The default in these skills is declarative.
- Never subscribe one pubsub + topic through two types in one app. The subscription is then registered twice.
- .NET streaming needs an explicit gRPC endpoint (verified): `builder.Services.AddDaprMessaging(o => o.DaprGrpcEndpoint = $"http://localhost:{Environment.GetEnvironmentVariable("DAPR_GRPC_PORT") ?? "50001"}")`. With a bare `AddDaprMessaging()` no connection to the sidecar was ever opened and nothing was delivered. In Aspire the port also comes from the injected `DAPR_GRPC_PORT`.
- Building a `Dapr.Messaging` streaming handler emits the build warning `DAPR1612` (message type not in a `JsonSerializerContext`). It matters only for AOT and is harmless.

Source: developing-applications/building-blocks/pubsub/subscription-methods.md

## Feature compatibility matrix

| Feature | Declarative | Programmatic | Streaming |
|---|---|---|---|
| Dead-letter topic | `spec.deadLetterTopic` | .NET `TopicOptions.DeadLetterTopic` or `[Topic(pubsub, topic, deadLetterTopic, false)]`; Python `dead_letter_topic=` | .NET `[DaprTopic(DeadLetterTopic = ...)]`; Python `dead_letter_topic=` |
| CEL routing (`match` / priority) | `routes.rules[{match, path}]` plus `routes.default`. **Python routing goes here**, the only scaffolded way. | .NET `TopicOptions.Match` / `Priority` or `[Topic(pubsub, topic, match, priority)]`. **Python: not supported** by `dapr-ext-fastapi`; the skill offers declarative instead (default) or documents the grpc `Rule` alternative. | **Not supported**: no routes in streaming (`subscription-methods.md`; `Match` and `Priority` are ignored, analyzer DAPR1617). The skill offers declarative instead. |
| Message TTL | Publisher side (`ttlInSeconds`), so it works with every type | same | same |
| Raw payload (subscriber side) | `spec.metadata.rawPayload: "true"` | .NET `EnableRawPayload` / `[Topic(pubsub, topic, true)]`; Python `metadata={"rawPayload": "true"}` | .NET `[DaprTopic(EnableRawPayload = true)]`; Python `metadata={"rawPayload": "true"}` |
| Bulk subscribe (recipe only) | `spec.bulkSubscribe` | .NET `WithBulkSubscribe` / `[BulkSubscribe]`; Python not in `dapr-ext-fastapi` | **Not supported** |
| Hot reload of the subscription | Yes, by default (`HotReload` feature) | No. "only read once during application start-up" | Dynamic in code, but not used by the scaffold |
| Inbound port and `appPort` needed | Yes | Yes | No |
| .NET style choice | minimal API or controllers | minimal API or controllers | none (handler class) |

Source: developing-applications/building-blocks/pubsub/subscription-methods.md; developing-applications/building-blocks/pubsub/howto-route-messages.md
