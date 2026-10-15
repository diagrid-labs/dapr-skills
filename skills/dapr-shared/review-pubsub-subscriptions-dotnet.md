# Pub/sub Subscriptions Checklist — .NET

Apply each rule to `subscriptions`, `handler_files` and `subscription_files` from `review-detect-target-pubsub.md`.

## Subscription types

A rule fires only for the types in its **Types** column. HTTP = declarative or programmatic.

| Rule id | Severity | Types | What to detect | Why it matters | Suggested fix | Source |
| ------- | -------- | ----- | -------------- | -------------- | ------------- | ------ |
| DPS-SUB-001 | critical | programmatic | `[Topic(` or `.WithTopic(` present and no `MapSubscribeHandler(` anywhere in the app. **Do not fire** when every such topic is also covered by a declarative Subscription for this app (that is DPS-SUB-014), or when the app only has declarative or streaming subscriptions | Dapr never learns the subscriptions | Add `app.MapSubscribeHandler()` | `subscription-methods.md`; `examples/AspNetCore/RoutingSample/Startup.cs` |
| DPS-SUB-002 | critical | HTTP | A handler endpoint (a declarative route target, or `[Topic]` / `WithTopic`) with a typed body parameter (not `HttpRequest`, `Stream`, `JsonElement`, or a `CloudEvent` / envelope type) and no `UseCloudEvents(` in the app, raw subscriptions excepted | The envelope is bound instead of the data: every field is null | `app.UseCloudEvents()` | `src/Dapr.AspNetCore/CloudEventsMiddleware.cs` |
| DPS-SUB-003 | critical | HTTP | `UseCloudEvents(` after `UseEndpoints(` or after a terminal `app.Run(` delegate in the same pipeline | The middleware never runs before the endpoints | Move it after `UseRouting()` and before the endpoints | SDK samples (`RoutingSample`, `ControllerSample`) |
| DPS-SUB-004 | critical | HTTP | `Results.NotFound`, `NotFound(`, `StatusCode(404` inside a handler | A 404 makes Dapr drop the message | Return SUCCESS, DROP or RETRY | `pubsub_api.md` |
| DPS-SUB-005 | critical | all | A `catch` in a handler that does not rethrow and returns success: a 2xx without a body, `{"status":"SUCCESS"}`, `TopicResponseAction.Success`. **Exempt:** a catch of a deserialization or validation exception (`JsonException`, a validation exception) that returns **DROP** | The message is acknowledged and lost | Rethrow, or return RETRY; DROP only for permanent errors (DROP is not redelivered, and the message goes to the dead-letter topic when one is configured) | `pubsub_api.md`; `pubsub-overview.md` |
| DPS-SUB-006 | warning (Please verify when the side effect is indirect) | all | A side effect in a handler (`SaveChanges`, `INSERT`, `HttpClient.Post`, a send-email or charge call, a publish) without a prior check on the CloudEvent `id` or a business key (`IsProcessed`, `Exists`, an upsert) | At-least-once delivery means duplicates | Deduplicate; use upserts | `pubsub-overview.md`; `pubsub-cloudevents.md` |
| DPS-SUB-007 | warning | all | `"status"` set to anything other than `SUCCESS`, `RETRY` or `DROP` (case-sensitive) | The message is retried | Use the three statuses | `pubsub_api.md` |
| DPS-SUB-008 | warning | all | A validation or deserialization failure path that returns 400, `BadRequest`, RETRY or `TopicResponseAction.Retry`, with no dead-letter topic on that subscription | Poison message, redelivered forever | DROP for permanent errors, plus a dead-letter topic. DROP is not redelivered; with a dead-letter topic configured the message is also forwarded to it | `pubsub_api.md`; `pubsub-deadletter.md` |
| DPS-SUB-009 | warning | all | A dead-letter topic value with no subscription (any type) to that topic in scope | Dead letters pile up unseen | Subscribe a handler | `pubsub-deadletter.md` |
| DPS-SUB-010 | warning | all | A publisher in scope sends `rawPayload: "true"` to topic T, and the subscription to T lacks `rawPayload: "true"`, `EnableRawPayload = true` or `[Topic(..., true)]` | The subscriber gets an unexpected format | Enable raw on the subscription, or stop publishing raw | `pubsub-raw.md`; `dapr/pkg/runtime/subscription/subscription.go` |
| DPS-SUB-012 | warning | declarative, programmatic | A `match` expression (YAML `rules.match`, `[Topic(...match...)]`, `TopicOptions.Match`) comparing `event.data.<field>` with a numeric literal and not wrapping the field in `int(` — whether the cast is missing entirely or is `double(` | Uncast, the match never fires (numbers are doubles); `double(` fires but diverges from the convention the rest of the project uses | `int(event.data.<field>) > N` | `howto-route-messages.md` |
| DPS-SUB-014 | warning | all | One app subscribes the same pubsub and topic via two or more types: a declarative Subscription scoped to it (or unscoped), plus programmatic code, plus streaming code | The precedence between types is undocumented; duplicate or missing delivery | Keep one type | `subscription-methods.md`; spec §3.1 |
| DPS-SUB-015 | critical | declarative | A Subscription `routes.default` or `rules[].path` with no matching POST endpoint (`MapPost`, `[HttpPost]`) in the app(s) it is scoped to | Dapr receives a 404 and drops the message | Add the endpoint, or fix the path | `pubsub_api.md`; `subscription-methods.md` |

DPS-SUB-011, DPS-SUB-013 and DPS-SUB-016 are Python-only and are not part of this file; see `review-pubsub-subscriptions-python.md`.

Dapr.Messaging analyzer diagnostics (DAPR1601–1617) are not duplicated; every `ITopicHandler` path returns a value by construction, so DPS-SUB-013 is Python-only.

## Streaming notes (.NET)

- Deserialization of the message body happens in generated dispatcher code before the handler runs. A body that cannot be deserialized into the handler's message type throws there and faults the streaming subscription, which reconnects and is redelivered. The handler cannot return `Drop` for it. Do not suggest `Drop` for malformed JSON on a streaming `ITopicHandler<T>`: the handler can only `Drop` messages that are well-formed JSON but semantically invalid (a missing identifier, a quantity that must be positive). Suggest a lenient contract (nullable members) and the sidecar's dead-letter and resiliency policy instead. Apply this to DPS-SUB-005 and DPS-SUB-008 findings on streaming handlers.
- A streaming `AddDaprMessaging()` registration with no explicit `DaprGrpcEndpoint` (derived from `DAPR_GRPC_PORT`) may never open the gRPC connection to the sidecar. This has no rule id: mention it under Please verify, cite the registration line, and say the verified working form sets `o.DaprGrpcEndpoint` explicitly.

## Confidence notes

- DPS-SUB-006 — rules on idempotency evidence. Treat as satisfied when a check on the CloudEvent `id` or a business key (`IsProcessed`, `Exists`, an upsert) is visible before the side effect. When the side effect is behind another method or service, report it under Please verify.
- DPS-SUB-015 — when the handler files are outside the review scope, report it under Please verify.
- DPS-SUB-014 — requires the app-id resolution from detection (`dapr.yaml` `appID`, Aspire `DaprSidecarOptions.AppId`), so the Subscription `scopes` can be matched to the app.
- DPS-SUB-001 — the app has `[Topic]` or `.WithTopic` plus `MapSubscribeHandler(` somewhere in `Program.cs` or `Startup.cs`: satisfied, even if the call is in a helper extension method found by `Grep`.

## Baseline

The templates in [dotnet-pubsub-subscriber-declarative.md](dotnet-pubsub-subscriber-declarative.md), [dotnet-pubsub-subscriber-programmatic.md](dotnet-pubsub-subscriber-programmatic.md), [dotnet-pubsub-messaging.md](dotnet-pubsub-messaging.md) and [dotnet-pubsub-handler.md](dotnet-pubsub-handler.md) produce no critical or warning finding.
