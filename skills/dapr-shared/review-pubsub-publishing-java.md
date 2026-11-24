# Pub/sub Publishing Checklist — Java

Apply each rule to every file in `publisher_files` from [`review-detect-target-pubsub.md`](review-detect-target-pubsub.md). `component_files` is context for DPS-PUB-003. The target is a Spring Boot app built with Maven that uses `dapr-spring-boot-starter`.

Rule source: see [`java-pubsub-publisher.md`](java-pubsub-publisher.md) and [`references/java/gotchas.md`](references/java/gotchas.md) §2. SDK paths in the Source column are relative to [dapr/java-sdk](https://github.com/dapr/java-sdk) at tag `v1.19.1`.

## Resolving names

Before comparing a pub/sub or topic name, resolve it:

- `pubSubProperties.getName()` on a `DaprPubSubProperties` bean is the `dapr.pubsub.name` property.
- A field set from `@Value("${app.topic}")` is that property.
- A `static final String` constant is its literal value.

Properties come from the app's configuration files, read as "Java properties" in detection describes (base and active-profile `application.*` files, with Spring's precedence). An unresolvable placeholder is reported under Please verify.

## Rule id map

| Rule id | .NET | Python | Java |
| --- | --- | --- | --- |
| DPS-PUB-001 | applies | applies | applies |
| DPS-PUB-002 | applies | applies | applies |
| DPS-PUB-003 | applies | applies | applies |
| DPS-PUB-004 | reserved | applies | reserved (Python-only) |
| DPS-PUB-005 | applies | applies | applies |
| DPS-PUB-006 | applies | applies | applies |
| DPS-PUB-007 | applies | applies | applies |
| DPS-PUB-008 | applies | applies | applies |
| DPS-PUB-009 | applies | applies | applies |
| DPS-PUB-010 | applies | applies | applies |
| DPS-PUB-011 | reserved | applies | reserved (Python-only) |
| DPS-PUB-012 | applies | applies | applies |
| DPS-PUB-013 | reserved | reserved | applies |
| DPS-PUB-014 | reserved | reserved | applies |

## Rules

| Rule id | Severity | What to detect | Why it matters | Suggested fix | Source |
| --- | --- | --- | --- | --- | --- |
| DPS-PUB-001 | critical | A `Mono` from `publishEvent(` / `publishEvents(` that is neither returned, `.block()`ed nor subscribed with an error consumer: a statement that ends with the call itself (`daprClient.publishEvent(...);`), a `Mono` assigned to a local that is never used, or `.subscribe()` / `.subscribe(consumer)` with no error callback. Cite the line of the `publishEvent(` call | The SDK builds the request inside `Mono.deferContextual`, so nothing is sent until the `Mono` is subscribed: a bare call never publishes. A `.subscribe()` with no error consumer sends it but drops the failure | `.block()` the call (as the template does), or return the `Mono` from a reactive endpoint | `sdk/src/main/java/io/dapr/client/DaprClientImpl.java:417-422`; `sdk/src/main/java/io/dapr/client/DaprClient.java:88` |
| DPS-PUB-002 | critical | A `catch` around a publish that is empty or returns 2xx (`ResponseEntity.ok(`, `.accepted()`, `.created(`, `.noContent()`, `HttpStatus.OK`). A catch that only logs and continues: **Please verify**. Cite the `catch` line | The caller believes the event was published | Rethrow, or return 503 (`ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)`); a failed `.block()` throws `DaprException` | `java-pubsub-publisher.md` "Key points"; `sdk/src/main/java/io/dapr/exceptions/DaprException.java` |
| DPS-PUB-003 | critical (Please verify when `component_files` is empty or the name is an unresolved placeholder) | The resolved pub/sub name argument (see "Resolving names") differs from every `metadata.name` in `component_files`. Cite the publish call line | Publish fails at runtime | Take the name from `dapr.pubsub.name` through `DaprPubSubProperties`, set to the component name | `reference/api/pubsub_api.md`; `java-pubsub-project.md` "application.properties" |
| DPS-PUB-005 | warning | An HTTP POST to `/v1.0/publish/` (`RestClient`, `RestTemplate`, `WebClient`, `HttpClient`) without `contentType(MediaType.APPLICATION_JSON)` or a `Content-Type: application/json` header. Cite the line with the URL | Dapr assumes `text/plain` | Set the content type, or publish with `DaprClient.publishEvent` | `pubsub-overview.md`; `pubsub_api.md` |
| DPS-PUB-006 | warning | `new DaprClientBuilder()` … `.build()` (or `.buildPreviewClient()`) inside a method body that is not a `@Bean` method, or a client built that way that is never closed (no try-with-resources, no `close()`), or `close()` called on the injected `DaprClient`. Cite the `new DaprClientBuilder()` line | Every call opens a gRPC channel that is never released: socket and thread exhaustion. Closing the shared bean breaks every other publisher | Take the autoconfigured `DaprClient` bean through the constructor into a `final` field | `java-pubsub-publisher.md` "Key points"; `dapr-spring/dapr-spring-boot-autoconfigure/src/main/java/io/dapr/spring/boot/autoconfigure/client/DaprClientAutoConfiguration.java:97` |
| DPS-PUB-007 | warning | `publishEvents(` whose `BulkPublishResponse` is not assigned, or whose `getFailedEntries()` is never read. Cite the `publishEvents(` line | Partial failures are lost: the call succeeds when some entries failed | Read `getFailedEntries()` and retry or report them | `pubsub-bulk.md`; `sdk/src/main/java/io/dapr/client/domain/BulkPublishResponse.java:48` |
| DPS-PUB-008 | warning | Metadata keys `cloudevent.traceparent`, `cloudevent.traceid`, `cloudevent.tracestate` in the map passed to a publish. Cite the line with the key | Breaks tracing | Remove them; the sidecar propagates trace context | `pubsub-cloudevents.md` |
| DPS-PUB-009 | info | The same pub/sub or topic string literal at 2 or more publish/subscribe sites. Only these sites count: the pub/sub and topic arguments of `publishEvent(` and `publishEvents(`; the topic argument of `send(` / `sendAsync(` called on a field, parameter or local typed `DaprMessagingTemplate`; the `name` and `pubsubName` of `@Topic(`; and `spec.pubsubname` / `spec.topic` of a `kind: Subscription` YAML in scope, which count only together with at least one code site carrying the same literal (YAML sites alone never make a finding). Any other `send(` (a mail sender, a `RestClient`, a `KafkaTemplate`) is not a site. A `${…}` placeholder is not a literal | Typos create other topics silently (names are case-sensitive) | Read the names from properties (`dapr.pubsub.name`, `app.topic`) or one shared constant | `pubsub_api.md`; `pubsub-scopes.md` |
| DPS-PUB-010 | warning, reported under Please verify | The data argument of a single-message `publishEvent(` is a collection (`List<`, `Set<`, `Collection<`, `.toList()`, `.collect(`, a repository `findAll(`) or bytes or a stream (`byte[]`, `InputStream`, `Files.readAllBytes(`). **Never the list passed to a bulk `publishEvents(`**: those entries are separate messages. Cite the publish line | Request body limit 4Mi (`--max-body-size`) | One event per item, or a reference | `reference/arguments-annotations-overview.md`; `pubsub-bulk.md` |
| DPS-PUB-012 | info, reported under Please verify | Metadata `rawPayload` = `"true"` in the map passed to a publish. Cite the line with the key | Loses tracing, dedupe id and content type | Confirm the consumers are non-Dapr, or that their subscriptions set `rawPayload` too | `pubsub-raw.md`; `java-pubsub-publisher.md` "TTL and raw payload" |
| DPS-PUB-013 | warning | Any use of `DaprMessagingTemplate`. Cite each `new DaprMessagingTemplate` line (usually a `@Bean` method) and name the files that call `send(` / `sendAsync(` / `newMessage(` on it in the `what` text. When no construction is in scope, cite the first `send(` / `sendAsync(` / `newMessage(` call in each file that uses one | The template publishes every message with a fixed 10-second TTL that neither `send` nor `newMessage(...)` can change. A message whose handler keeps failing expires during the retries and never reaches the dead-letter topic; a message published while the subscriber is down is dropped as expired | Publish with `daprClient.publishEvent(pubsubName, topic, event).block()` (no TTL unless you ask for one) | `references/java/gotchas.md` §2; `dapr-spring/dapr-spring-messaging/src/main/java/io/dapr/spring/messaging/DaprMessagingTemplate.java:44`, `:74` |
| DPS-PUB-014 | info | `publishEvents(` called on a `DaprPreviewClient` (a field, parameter or local of that type). Cite the call line | The preview `publishEvents` overloads are deprecated; bulk publish is stable on `DaprClient` | Call `publishEvents(...)` on the injected `DaprClient` | `sdk/src/main/java/io/dapr/client/DaprPreviewClient.java:169-172`, `:186-189` |

DPS-PUB-004 and DPS-PUB-011 are Python-only and are not part of this file; see `review-pubsub-publishing-python.md`.

## Confidence notes

- DPS-PUB-001 — `.block()` anywhere in the call chain satisfies the rule, as does `return daprClient.publishEvent(...)` from a method that returns `Mono<Void>`, and `.subscribe(consumer, errorConsumer)`. `DaprMessagingTemplate.send(...)` blocks internally; it is DPS-PUB-013, not this rule.
- DPS-PUB-002 — A catch that logs and continues, or that returns a non-2xx status on only some paths, is reported under Please verify. An empty catch or one that returns 2xx is critical.
- DPS-PUB-003 — The template's `pubSubProperties.getName()` with `dapr.pubsub.name=pubsub` and a component named `pubsub` is correct.
- DPS-PUB-006 — A `@Bean` method that returns `new DaprClientBuilder().build()` is not this rule: it replaces the autoconfigured `DaprClient` bean (`@ConditionalOnMissingBean`, `DaprClientAutoConfiguration.java:95-97`), and the replacement loses the Jackson 3 serializer and the connection settings that the autoconfigured `DaprClientBuilder` carries. Report it under Please verify, at the `new DaprClientBuilder()` line, asking whether the replacement is intended. `buildPreviewClient()` on the injected `DaprClientBuilder` keeps both and is not a finding.
- DPS-PUB-009 — Report once per project, citing the first site in path-then-line order and listing the other lines in the `what` text. The template reads every name from a property, so its code never matches, and the `pubsubname: pubsub` of its Subscription YAML documents does not count without a code site carrying the same literal.
- DPS-PUB-010 — Always report under Please verify: the payload size cannot be proven statically. A record with a `List` component is one event, not a collection payload.
- DPS-PUB-012 — Always report under Please verify; raw publishing is legitimate when the consumers are non-Dapr. `ttlInSeconds` metadata is not a finding.
- DPS-PUB-013 — The constructor sets the TTL whatever `observationEnabled` is (SDK 1.19.1 has only the three-argument constructor; older versions also had a two-argument one with the same TTL). Report the template even when it is a `@Bean` that nothing in scope calls yet.

## Baseline

The publisher in [java-pubsub-publisher.md](java-pubsub-publisher.md), with the project files from [java-pubsub-project.md](java-pubsub-project.md), produces no finding.
