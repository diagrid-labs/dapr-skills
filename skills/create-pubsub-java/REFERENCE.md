# Create Dapr Pub/Sub Java Application — Reference

All code and YAML lives in [`../dapr-shared/`](../dapr-shared/SKILL.md); this file says which section to copy for each case and shows the resulting layouts. File and type names below are placeholders resolved from the specification interview; the vocabulary is in [`pubsub-placeholders.md`](../dapr-shared/pubsub-placeholders.md). Package versions come from [dapr-versions.md](../dapr-shared/dapr-versions.md). The SDK behaviour behind every rule here is recorded in [gotchas.md](../dapr-shared/references/java/gotchas.md).

## Folder structures

Role both, declarative subscriber:

```
<ProjectRoot>/
├── .gitignore
├── pom.xml                      # aggregator: <modules> publisher, subscriber
├── dapr.yaml
├── pubsub.http
├── README.md
├── resources/
│   ├── pubsub.yaml
│   ├── resiliency.yaml
│   └── subscription.yaml
├── publisher/
│   ├── pom.xml
│   └── src/main/
│       ├── resources/application.properties   # server.port=8001, dapr.pubsub.name, app.topic
│       └── java/<javaPackage>/publisher/
│           ├── Application.java               # @EnableConfigurationProperties(DaprPubSubProperties.class)
│           ├── <EventName>.java
│           └── <PublishResource>Controller.java
└── subscriber/
    ├── pom.xml
    └── src/main/
        ├── resources/application.properties   # server.port=8002, app.topic, app.dead-letter-topic
        └── java/<javaPackage>/subscriber/
            ├── Application.java
            ├── <EventName>.java
            ├── <EventName>Handler.java
            ├── ProcessedEvents.java
            ├── InMemoryProcessedEvents.java
            ├── TopicEventStatus.java
            ├── UnreadableEventAdvice.java
            └── <TopicResource>EventsController.java   # plain @PostMapping routes, no @Topic
```

Role both, programmatic subscriber: the same tree without `resources/subscription.yaml`.
`<TopicResource>EventsController` carries `@Topic` on each route.

Role both, streaming subscriber:

```
<ProjectRoot>/
├── .gitignore
├── pom.xml
├── dapr.yaml                    # subscriber entry has no appPort
├── pubsub.http                  # no @subscriberHost, no direct-CloudEvent request
├── README.md
├── resources/
│   ├── pubsub.yaml
│   └── resiliency.yaml          # no subscription.yaml
├── publisher/                   # as above
└── subscriber/
    ├── pom.xml
    └── src/main/
        ├── resources/application.properties
        └── java/<javaPackage>/subscriber/
            ├── Application.java
            ├── <EventName>.java
            ├── <EventName>Handler.java
            ├── ProcessedEvents.java
            ├── InMemoryProcessedEvents.java
            ├── TopicEventStatus.java
            ├── StreamingConfiguration.java              # DaprPreviewClient bean
            └── <TopicResource>StreamingSubscriber.java  # SmartLifecycle, subscribeToTopic
```

Single role (publisher or subscriber only): the same layout with one app folder. The aggregator
`pom.xml` lists only that module, `dapr.yaml` has one app entry, and `pubsub.http` drops the requests for
the absent role. `mvn -q -DskipTests package` still runs in `<ProjectRoot>`.

## dapr.yaml

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
apps:
  - appID: <root-kebab>-publisher
    appDirPath: publisher
    appPort: 8001
    daprHTTPPort: 3501
    command: ["mvn", "spring-boot:run"]
  - appID: <root-kebab>-subscriber
    appDirPath: subscriber
    appPort: 8002          # omit this line for a streaming subscriber
    daprHTTPPort: 3502
    command: ["mvn", "spring-boot:run"]
```

### Key points

- `command` runs each app through the `spring-boot-maven-plugin` in its own folder. The first start
  downloads the dependencies, so the apps can take a minute to come up.
- `appPort` equals `server.port` in that app's `application.properties`. The SDK finds its sidecar through
  the `DAPR_HTTP_PORT` and `DAPR_GRPC_PORT` variables `dapr run` sets, so there is no `daprGRPCPort` and no
  `dapr.client.*` property.
- `appLogDestination: fileAndConsole` writes `.dapr/logs/` inside each app folder, which `.gitignore`
  excludes.

## Files per subscription type

Section names refer to the headings in the shared files.

| File | Declarative (default) | Programmatic | Streaming |
|---|---|---|---|
| Subscriber controller | `java-pubsub-subscriber-declarative.md` → **<TopicResource>EventsController** | `java-pubsub-subscriber-programmatic.md` → **<TopicResource>EventsController** | `java-pubsub-subscriber-streaming.md` → **StreamingConfiguration** and **<TopicResource>StreamingSubscriber** |
| Handler files | `java-pubsub-handler.md`: every section | same | every section except **UnreadableEventAdvice** |
| `resources/subscription.yaml` | `dapr-pubsub-subscription.md` → **resources/subscription.yaml**, `scopes: [<root-kebab>-subscriber]` | not created | not created |
| `dapr.yaml` subscriber entry | `appPort: 8002` | `appPort: 8002` | no `appPort` |
| Publisher | `java-pubsub-publisher.md` → **Message record** and **Publish endpoint** | same | same |
| `pom.xml` files, `Application.java`, `application.properties`, `.gitignore` | `java-pubsub-project.md` | same | same |
| `resources/pubsub.yaml` | `dapr-pubsub-redis.md` | same | same |
| `resources/resiliency.yaml` | `dapr-pubsub-resiliency.md` → **resources/resiliency.yaml** | same | same |
| `pubsub.http` | `pubsub-local-http.md`, camelCase keys | adds the `/dapr/subscribe` request | drops `@subscriberHost` and the direct-CloudEvent request |

## Routing, TTL and raw payload

Add these only when the user asks for them. The dead-letter topic and the inbound retry policy are always
present unless declined.

| Feature | Declarative | Programmatic | Streaming |
|---|---|---|---|
| Content-based routing | `dapr-pubsub-subscription.md` → **With routing rules**, plus one route per rule from `java-pubsub-subscriber-declarative.md` → **Routing rules** (`<SubscribeRoute>/<RuleName>`) | `java-pubsub-subscriber-programmatic.md` → **Routing rules** (`@Topic(..., rule = @Rule(match = "<MatchExpression>", priority = 1))`) | Not supported. Ask: "Streaming subscriptions cannot route by content. Use a declarative subscription for this topic instead? (default: yes)" |
| Message TTL | Publisher side: `java-pubsub-publisher.md` → **TTL and raw payload** (`Map.of("ttlInSeconds", "60")`, a string) | same | same |
| Raw payload | Publisher `rawPayload` per `java-pubsub-publisher.md` → **TTL and raw payload**; subscriber: `dapr-pubsub-subscription.md` → **With raw payload** | `java-pubsub-subscriber-programmatic.md` → **Raw payload** | `java-pubsub-subscriber-streaming.md` → **Raw payload** |

Notes:

- The metadata key is always `rawPayload`, and metadata values are strings.
- Every numeric CEL comparison wraps the field in `int()` (`int(event.data.amount) > 1000`). A rule whose
  CEL cannot evaluate the payload never reaches the app: the sidecar dead-letters the message.
- A raw subscription expects raw publishers. Add raw payload only when the user asks for it, and say in the
  README that both sides must use it.

## README key points

- Start with `dapr run -f .` from the project root. Ports: publisher 8001 (Dapr 3501), subscriber 8002
  (Dapr 3502; a streaming subscriber has no app port). The first start downloads the Maven dependencies.
- Try it: a `curl -X POST http://localhost:8001/<PublishRoute> -H "Content-Type: application/json" -d '...'`
  with a JSON body carrying the record components of `<EventName>` as camelCase keys, then the line
  `<HandlerBody>` logs in the subscriber. Link to `pubsub.http`.
- List subscriptions with `GET http://localhost:3502/v1.0/metadata` and in the Dev Dashboard's
  subscriptions view. Programmatic: `GET http://localhost:8002/dapr/subscribe` shows what the app
  advertises.
- Declarative: the Subscription YAML hot-reloads. Programmatic subscriptions are read once at start-up.
  Streaming subscriptions live in code.
- Mermaid sequence diagram: publisher -> publisher sidecar -> Redis; then for declarative and programmatic,
  subscriber sidecar -> subscriber (HTTP POST); for streaming, subscriber -> subscriber sidecar (opens the
  gRPC stream) and the sidecar pushes messages over it.
- Delivery semantics, declarative and programmatic (state them as recorded in gotchas.md §1):
  - the handler succeeds → 200 `{"status": "SUCCESS"}`, handled once;
  - the handler throws (a transient error) → Dapr delivers the message 6 times, 5s apart, then sends it to
    the dead-letter topic;
  - an invalid or unreadable message → 200 `{"status": "DROP"}`: **a dropped message goes to the
    dead-letter topic** at once, it is not redelivered;
  - duplicates (an `<idField>` already processed) are acknowledged and skipped.
- Delivery semantics, streaming (gotchas.md §3): the preview API acks every event it hands to the app, so
  **the app cannot choose RETRY or DROP**; a failed handler loses the event. **An exception in the handler
  must be caught so the stream stays open**: the generated handler catches it inside `doOnNext`, and
  `retryWhen` reopens the stream after a body that cannot be deserialized, which is the only case that is
  dead-lettered.
- The publisher uses `DaprClient.publishEvent(...).block()`, not `DaprMessagingTemplate`, because the
  template gives every message a 10-second TTL that would expire it before it reaches the dead-letter
  topic.
- Delivery is at least once; the handler deduplicates on `<idField>`. `InMemoryProcessedEvents` is lost on
  restart, so use a Dapr state store before production.
- Local-only items (state them as such, not as defects): Redis without a password, no component `scopes`,
  no stream trimming.
- Include a short "Switching the message broker" paragraph: the app runs on Redis locally. Any broker works
  by replacing `resources/pubsub.yaml` with a component of that type from
  https://docs.dapr.io/reference/components-reference/supported-pubsub/ (for example a `pubsub.kafka`
  component) while keeping `metadata.name: pubsub`, so the code does not change. Never put secrets inline:
  use `secretKeyRef`. When the user asked for another broker, add: "You asked for <broker>; this scaffold
  runs on Redis locally so it works without extra infrastructure."
- Never suggest running Redis separately.
- Finish with the Dev Dashboard section, the Diagrid section and the three review skills.

## Worked example: one resolved scenario

This is **not** a default. It shows what the placeholders look like once one particular interview has been
answered. A different prompt resolves them differently, and a prompt that names no domain is answered by
asking, never by reusing the values below.

Prompt: "Create a Java pub/sub app called OrderFlow that publishes an `OrderPlaced` event — order id,
customer id, amount, placed-at — on the `orders` topic, with a declarative subscriber that logs each order."

Resolved: role both, declarative. `<EventName>` = `OrderPlaced`, `<eventVar>` = `order`,
`<EventDescription>` = `order`, `<EventFields>` = `String orderId, String customerId, double amount,
Instant placedAt`, `<idField>` = `orderId`, `<TopicName>` = `orders`, `<TopicResource>` = `Orders`,
`<PublishRoute>` = `orders`, `<PublishResource>` = `Orders`, `<SubscribeRoute>` = `/events/pubsub/orders`,
`<DeadLetterRoute>` = `/events/pubsub/orders-deadletter`, `<javaPackage>` = `com.example.orderflow`,
`<root-kebab>` = `orderflow`,
`<ValidationCondition>` = `order.orderId() == null || order.orderId().isBlank()`,
`<HandlerBody>` = `logger.info("Order {} received: {} for customer {}", order.orderId(), order.amount(), order.customerId());`.

Files:

```
OrderFlow/
├── .gitignore
├── pom.xml
├── dapr.yaml
├── pubsub.http
├── README.md
├── resources/pubsub.yaml
├── resources/resiliency.yaml
├── resources/subscription.yaml
├── publisher/pom.xml
├── publisher/src/main/resources/application.properties
├── publisher/src/main/java/com/example/orderflow/publisher/Application.java
├── publisher/src/main/java/com/example/orderflow/publisher/OrderPlaced.java
├── publisher/src/main/java/com/example/orderflow/publisher/OrdersController.java
├── subscriber/pom.xml
├── subscriber/src/main/resources/application.properties
└── subscriber/src/main/java/com/example/orderflow/subscriber/
    ├── Application.java
    ├── OrderPlaced.java
    ├── OrderPlacedHandler.java
    ├── ProcessedEvents.java
    ├── InMemoryProcessedEvents.java
    ├── TopicEventStatus.java
    ├── UnreadableEventAdvice.java
    └── OrdersEventsController.java
```

`subscriber/src/main/resources/application.properties`:

```properties
spring.application.name=orderflow-subscriber
server.port=8002
dapr.pubsub.name=pubsub
app.topic=orders
app.dead-letter-topic=orders-deadletter
```

`resources/subscription.yaml` (the first document; the dead-letter document follows in the same file, see
`dapr-pubsub-subscription.md`):

```yaml
apiVersion: dapr.io/v2alpha1
kind: Subscription
metadata:
  name: orders-subscription
spec:
  pubsubname: pubsub
  topic: orders
  routes:
    default: /events/pubsub/orders
  deadLetterTopic: orders-deadletter
scopes:
  - orderflow-subscriber
```

`scopes` equals the subscriber `appID` in `dapr.yaml`.

Verify: `mvn -q -DskipTests package` in `OrderFlow` exits with code 0.
