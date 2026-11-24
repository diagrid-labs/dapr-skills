# Pub/sub Subscriptions Checklist — Java

Apply each rule to `subscriptions`, `handler_files` and `subscription_files` from `review-detect-target-pubsub.md`. The target is a Spring Boot app built with Maven that uses `dapr-spring-boot-starter`: declarative subscriptions are `kind: Subscription` YAML routed to `@PostMapping` methods, programmatic ones are `@Topic` methods, and streaming ones use `DaprPreviewClient.subscribeToTopic(...)`.

Rule source: see [`java-pubsub-handler.md`](java-pubsub-handler.md), the three `java-pubsub-subscriber-*.md` templates and [`references/java/gotchas.md`](references/java/gotchas.md) §1, §3 and §8. SDK paths in the Source column are relative to [dapr/java-sdk](https://github.com/dapr/java-sdk) at tag `v1.19.1`.

## Rule id map

| Rule id | .NET | Python | Java |
| --- | --- | --- | --- |
| DPS-SUB-001 | applies | reserved | reserved (.NET-only) |
| DPS-SUB-002 | applies | applies | applies |
| DPS-SUB-003 | applies | reserved | reserved (.NET-only) |
| DPS-SUB-004 | applies | applies | applies |
| DPS-SUB-005 | applies | applies | applies |
| DPS-SUB-006 | applies | applies | applies |
| DPS-SUB-007 | applies | applies | applies |
| DPS-SUB-008 | applies | applies | applies |
| DPS-SUB-009 | applies | applies | applies |
| DPS-SUB-010 | applies | applies | applies |
| DPS-SUB-011 | reserved | applies | reserved (Python-only) |
| DPS-SUB-012 | applies | applies | applies |
| DPS-SUB-013 | reserved | applies | not applicable to Java (the SDK acks every event it hands to the app; see DPS-SUB-017 to 019) |
| DPS-SUB-014 | applies | applies | applies |
| DPS-SUB-015 | applies | applies | applies |
| DPS-SUB-016 | reserved | applies | applies |
| DPS-SUB-017 | reserved | reserved | applies |
| DPS-SUB-018 | reserved | reserved | applies |
| DPS-SUB-019 | reserved | reserved | applies |
| DPS-SUB-020 | reserved | reserved | applies |

## Subscription types

A rule fires only for the types in its **Types** column. HTTP = declarative or programmatic. A streaming "consumer" is the lambda or method reference passed to `.doOnNext(...)` or as the first argument of `.subscribe(...)` on the `Flux` that `subscribeToTopic(` / `subscribeToEvents(` returns.

| Rule id | Severity | Types | What to detect | Why it matters | Suggested fix | Source |
| ------- | -------- | ----- | -------------- | -------------- | ------------- | ------ |
| DPS-SUB-002 | critical | HTTP | A handler method (a declarative route target or a `@Topic` method) whose `@RequestBody` parameter is the domain record, or another type that is not `CloudEvent<T>`, `byte[]`, `String`, `JsonNode` or `Map`, on a subscription that is not raw. Cite the method declaration line | The CloudEvent envelope is bound to the record: its fields arrive as `null`, or the body is rejected with a 400, which Dapr retries | Declare the parameter as `@RequestBody CloudEvent<T>` and read `event.getData()` | `references/java/gotchas.md` §1, §8; `java-pubsub-subscriber-programmatic.md` |
| DPS-SUB-004 | critical | HTTP | `ResponseEntity.notFound()`, `HttpStatus.NOT_FOUND`, `ResponseStatusException(` with `NOT_FOUND`, or a thrown exception class annotated `@ResponseStatus(HttpStatus.NOT_FOUND)` in a handler. Cite that line | A 404 makes Dapr drop the message | Return 200 with `SUCCESS` or `DROP`, or throw for a retry | `pubsub_api.md`; `references/java/gotchas.md` §1 |
| DPS-SUB-005 | critical | all | A `catch` in a handler (or in a method it calls in the same class) that does not rethrow and returns success: 200 with no body, `{"status":"SUCCESS"}`, the `SUCCESS` constant of the app's status record. **Exempt:** a catch of `HttpMessageNotReadableException`, a validation exception or a JSON parsing exception (`JacksonException`, `JsonProcessingException`) that returns **DROP**; a streaming consumer's catch that logs (that is the required shape, see DPS-SUB-017). Cite the `return` line in the catch | The message is acknowledged and lost | Rethrow, so Dapr retries; DROP only for permanent errors (DROP is not redelivered, and the message goes to the dead-letter topic when one is configured) | `pubsub_api.md`; `references/java/gotchas.md` §1 |
| DPS-SUB-006 | warning (Please verify when the side effect is indirect) | all | A side effect in a handler (a repository `save` / `delete`, `JdbcTemplate.update`, a `RestClient` / `RestTemplate` / `WebClient` POST, PUT or DELETE, a send-mail or charge call, a publish) without a prior check on the CloudEvent `getId()` or a business key (`isProcessed(`, `existsById(`, an upsert). Cite the side-effect line | At-least-once delivery means duplicates | Deduplicate on the CloudEvent id or a business key; use upserts | `pubsub-overview.md`; `java-pubsub-handler.md` "ProcessedEvents" |
| DPS-SUB-007 | warning | HTTP | A returned status other than `SUCCESS`, `RETRY` or `DROP` (case-sensitive): `new TopicEventStatus("<other>")`, `Map.of("status", "<other>")`, or a status record built from a variable. Cite that line | The message is retried | Use the three statuses | `pubsub_api.md` |
| DPS-SUB-008 | warning | HTTP | On a subscription with no dead-letter topic: a validation path that returns 400 (`ResponseEntity.badRequest()`, `HttpStatus.BAD_REQUEST`) or `RETRY` (cite that `return` line); or, when the app has no `@RestControllerAdvice` mapping `HttpMessageNotReadableException` to 200 `{"status":"DROP"}`, the subscription itself (cite its `@Topic(` line or its Subscription `topic:` line). Report one finding per subscription, preferring the `return` line | A poison message is redelivered for the whole retry policy and then left pending in the broker. Without the advice, a body that cannot bind to the record answers 400, which Dapr retries | DROP for permanent errors, add the template's `UnreadableEventAdvice`, and set a dead-letter topic. DROP is not redelivered; with a dead-letter topic configured the message is also forwarded to it | `references/java/gotchas.md` §1; `java-pubsub-handler.md` "UnreadableEventAdvice"; `pubsub-deadletter.md` |
| DPS-SUB-009 | warning | all | A dead-letter topic value (YAML `deadLetterTopic`, `@Topic(deadLetterTopic = …)`, the third argument of a four- or five-argument `subscribeToTopic(`) with no subscription of any type to that topic in scope. Cite the line that sets the dead-letter topic | Dead letters pile up unseen | Subscribe a handler to the dead-letter topic | `pubsub-deadletter.md` |
| DPS-SUB-010 | warning | all | A publisher in scope sends `rawPayload: "true"` to topic T, and the subscription to T lacks `rawPayload: "true"` (YAML `spec.metadata`, `@Topic(metadata = "{\"rawPayload\": \"true\"}")`, or the `subscribeToTopic(` metadata map). Cite the subscription's location | The subscriber gets an unexpected format | Enable raw on the subscription, or stop publishing raw | `pubsub-raw.md`; `java-pubsub-subscriber-programmatic.md` "Raw payload" |
| DPS-SUB-012 | warning | declarative, programmatic | A `match` expression (YAML `rules.match`, or `@Topic(rule = @Rule(match = "…"))`) comparing `event.data.<field>` with a numeric literal and not wrapping the field in `int(`, whether the cast is missing entirely or is `double(`. Cite the line with the `match` | Uncast, the match never fires (numbers are doubles); `double(` fires but diverges from the convention the rest of the project uses | `int(event.data.<field>) > N` | `howto-route-messages.md`; `java-pubsub-subscriber-programmatic.md` "Routing rules" |
| DPS-SUB-014 | warning | all | One app subscribes the same pubsub and topic via two or more types: a declarative Subscription scoped to it (or unscoped), plus a `@Topic` method, plus a `subscribeToTopic(` stream. Cite the code subscription (the `@Topic(` or `subscribeToTopic(` line) and name the Subscription document lines in the `what` text | The precedence between types is undocumented; duplicate or missing delivery | Keep one type per topic per app | `subscription-methods.md`; `java-pubsub-subscriber-declarative.md` "Key points" |
| DPS-SUB-015 | critical | declarative | A Subscription `routes.default` or `rules[].path` with no matching POST method (`@PostMapping`, or `@RequestMapping` with `method = POST`, joined with any class-level `@RequestMapping` prefix) in the app(s) it is scoped to. Cite the YAML line with the path | Dapr receives a 404 and drops the message | Add the `@PostMapping` method, or fix the path | `pubsub_api.md`; `subscription-methods.md` |
| DPS-SUB-016 | warning | streaming | The `Disposable` returned by `.subscribe(...)` on a `subscribeToTopic(` / `subscribeToEvents(` stream is discarded (the statement ends at `.subscribe(...)`), or is kept but never disposed in `SmartLifecycle.stop()`, a `@PreDestroy` method or `DisposableBean.destroy()`. Cite the `.subscribe(` line | The gRPC stream is never closed on shutdown | Keep each `Disposable` in a list and dispose it in `stop()` (the template's `SmartLifecycle`) | `java-pubsub-subscriber-streaming.md`; `sdk/src/main/java/io/dapr/client/DaprClientImpl.java:645-652` |
| DPS-SUB-017 | critical | streaming | A streaming consumer with no `try`/`catch` around its work, directly or in the method it references. **Exempt:** a consumer whose whole body is logging calls, directly or through a method whose body is only logging calls (the template's dead-letter consumer `handler.handleDeadLetter(...)`, which only logs). Cite the `.doOnNext(` or `.subscribe(` line that passes the consumer | An exception closes the gRPC stream before the SDK sends its ack. The message is never dead-lettered: the broker redelivers it, it throws again, and the loop repeats (a poison message), while later events wait for a new stream | Wrap the work in `try`/`catch (RuntimeException e)` that logs, as the template's `handleSafely` does | `references/java/gotchas.md` §3; `sdk/src/main/java/io/dapr/internal/subscription/EventSubscriberStreamObserver.java:158-166`, `:179-195` |
| DPS-SUB-018 | warning | streaming | No `.retryWhen(...)` between `subscribeToTopic(` / `subscribeToEvents(` and `.subscribe(` on a topic or dead-letter stream. Cite the `subscribeToTopic(` / `subscribeToEvents(` line | A body that cannot be deserialized is acked DROP and then errors the `Flux`, which ends the subscription: later events on that topic are not delivered until the app restarts | `.retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30)).transientErrors(true))` before `.subscribe()` | `references/java/gotchas.md` §3; `EventSubscriberStreamObserver.java:168-177` |
| DPS-SUB-019 | info, reported under Please verify | streaming | In a streaming consumer, or a method of the same class it calls, a branch that "drops", "rejects", "skips" or "retries" the event by returning early or by only logging (the log text or a comment says so). **Exempt:** a consumer that calls a shared handler and logs the status it returns, as the template's `handleSafely` does. Cite the `return` line of the branch (the log line when the branch has no `return`) | The SDK acks SUCCESS for every event it emits, whatever the consumer does: the event is neither dead-lettered nor redelivered | Accept that the event is acknowledged, and record it yourself (for example publish it to a parking topic) if it must not be lost | `references/java/gotchas.md` §3; `EventSubscriberStreamObserver.java:158-166` |
| DPS-SUB-020 | warning | streaming | `subscribeToEvents(` on a `DaprPreviewClient`. Cite the call line | Every `subscribeToEvents` overload is deprecated | `subscribeToTopic(...)` with the same arguments | `sdk/src/main/java/io/dapr/client/DaprPreviewClient.java:290-340` |

DPS-SUB-001 and DPS-SUB-003 are .NET-only and DPS-SUB-011 is Python-only; they are not part of this file. DPS-SUB-013 does not apply to Java.

## Streaming notes (Java)

- The preview API acks every event it hands to the app as SUCCESS. The consumer cannot ask for RETRY or DROP: never suggest returning `RETRY` or `DROP` from a streaming consumer in a `Fix:` line. Only a body that cannot be deserialized is dead-lettered (acked DROP by the SDK).
- With no `appPort` a streaming-only app is correct; do not report a missing `appPort` for it.
- `DaprPreviewClient` built from the autoconfigured `DaprClientBuilder` (`buildPreviewClient()`) in a `@Bean` method is correct; it is not DPS-PUB-006.

## Confidence notes

- DPS-SUB-002 — A raw subscription (`rawPayload` in its metadata) that binds `CloudEvent<T>` and reads `getBinaryData()` is correct. `CloudEvent<Object>` on a dead-letter route is correct.
- DPS-SUB-005 — The template's raw route `catch (JacksonException e) { return ResponseEntity.ok(TopicEventStatus.DROP); }` is exempt.
- DPS-SUB-006 — Treat as satisfied when a check on the CloudEvent `getId()` or a business key (`processedEvents.isProcessed(...)`, `existsById`, an upsert) is visible before the side effect. A handler that only logs has no side effect. When the side effect is behind another bean, report it under Please verify.
- DPS-SUB-008 — The template's shared handler returns `DROP` for an invalid event and has `UnreadableEventAdvice`, so it never matches. The dead-letter route's own subscription has no dead-letter topic; it is not this rule while the app has the advice.
- DPS-SUB-009 — Resolve `${…}` placeholders first. A dead-letter topic subscribed by another app in scope counts as subscribed.
- DPS-SUB-014 — Requires the app-id resolution from detection (`dapr.yaml` `appID` and `appDirPath`), so the Subscription `scopes` can be matched to the Maven module. A class gated by `@Profile` counts only when that profile is active: read `SPRING_PROFILES_ACTIVE` from the app's `env` in `dapr.yaml`, or `spring.profiles.active` from `application.properties`. When the duplicate exists only under a profile the run files do not activate, report it under Please verify. A declarative Subscription is not profile-gated: it loads whatever profile is active.
- DPS-SUB-015 — When the handler files are outside the review scope, report it under Please verify.
- DPS-SUB-016 — `subscriptions.add(previewClient.subscribeToTopic(...)....subscribe())` keeps the `Disposable`; it is satisfied when `stop()` or a `@PreDestroy` method disposes the list.
- DPS-SUB-017 — The template's topic consumer `this::handleSafely` has the `try`/`catch`, and its dead-letter consumer only logs: neither matches.
- DPS-SUB-019 — The template's `handleSafely` logs the status the shared handler returns ("the SDK acks SUCCESS regardless"); it is exempt.

## Baseline

The templates in [java-pubsub-subscriber-declarative.md](java-pubsub-subscriber-declarative.md), [java-pubsub-subscriber-programmatic.md](java-pubsub-subscriber-programmatic.md), [java-pubsub-subscriber-streaming.md](java-pubsub-subscriber-streaming.md) and [java-pubsub-handler.md](java-pubsub-handler.md) produce no critical or warning finding.
