# Pub/sub Subscriptions Checklist — Python

Apply each rule to `subscriptions`, `handler_files` and `subscription_files` from `review-detect-target-pubsub.md`.

## Subscription types

A rule fires only for the types in its **Types** column. HTTP = declarative or programmatic.

| Rule id | Severity | Types | What to detect | Why it matters | Suggested fix | Source |
| ------- | -------- | ----- | -------------- | -------------- | ------------- | ------ |
| DPS-SUB-002 | critical | HTTP | A route that is a declarative route target, or a `DaprApp.subscribe` handler, whose body parameter is a domain Pydantic model with required fields (not `dict = Body(...)` or a CloudEvent model) | The envelope is validated against the domain model: FastAPI returns 422 and the message is retried forever | Accept `dict = Body(...)` and validate `event["data"]` | `python-fastapi.md`; `pubsub_api.md` |
| DPS-SUB-004 | critical | HTTP | `HTTPException(status_code=404` inside a handler | A 404 makes Dapr drop the message | Return SUCCESS, DROP or RETRY | `pubsub_api.md` |
| DPS-SUB-005 | critical | all | An `except` in a handler that does not re-raise and returns success: a 2xx without a body, `{"status":"SUCCESS"}`, `TopicEventResponse("success")`, `respond_success`. **Exempt:** an except of a deserialization or validation exception (`ValidationError`, `ValueError` from parsing) that returns **DROP** | The message is acknowledged and lost | Re-raise, or return RETRY; DROP only for permanent errors (DROP is not redelivered, and the message goes to the dead-letter topic when one is configured) | `pubsub_api.md`; `pubsub-overview.md` |
| DPS-SUB-006 | warning (Please verify when the side effect is indirect) | all | A side effect in a handler (`INSERT`, `requests.post`, `httpx.post`, a send-email or charge call, a publish) without a prior check on the CloudEvent `id` or a business key (`in _processed`, `exists`, an upsert) | At-least-once delivery means duplicates | Deduplicate; use upserts | `pubsub-overview.md`; `pubsub-cloudevents.md` |
| DPS-SUB-007 | warning | all | `"status"` set to anything other than `SUCCESS`, `RETRY` or `DROP` (case-sensitive), or `TopicEventResponse("<other>")` | `KeyError` in the SDK (streaming and gRPC responses); the message is retried (HTTP) | Use the three statuses | `pubsub_api.md`; `dapr/clients/grpc/_response.py` |
| DPS-SUB-008 | warning | all | A validation or deserialization failure path that returns 400, 422, RETRY or `TopicEventResponse("retry")` (or lets FastAPI produce 422), with no dead-letter topic on that subscription | Poison message, redelivered forever | DROP for permanent errors, plus a dead-letter topic. DROP is not redelivered; with a dead-letter topic configured the message is also forwarded to it | `pubsub_api.md`; `pubsub-deadletter.md` |
| DPS-SUB-009 | warning | all | A dead-letter topic value with no subscription (any type) to that topic in scope | Dead letters pile up unseen | Subscribe a handler | `pubsub-deadletter.md` |
| DPS-SUB-010 | warning | all | A publisher in scope sends `rawPayload: "true"` to topic T, and the subscription to T lacks `rawPayload: "true"` in its metadata | The subscriber gets an unexpected format | Enable raw on the subscription, or stop publishing raw | `pubsub-raw.md`; `dapr/pkg/runtime/subscription/subscription.go` |
| DPS-SUB-011 | warning | programmatic | A function decorated with `@<DaprApp>.subscribe(` is called or referenced elsewhere | The decorator returns `None` | Call a separate plain function | `ext/dapr-ext-fastapi/dapr/ext/fastapi/app.py` |
| DPS-SUB-012 | warning | declarative, programmatic | A `match` expression (YAML `rules.match`, grpc `Rule(`) comparing `event.data.<field>` with a numeric literal and not wrapping the field in `int(` — whether the cast is missing entirely or is `double(` | Uncast, the match never fires (numbers are doubles); `double(` fires but diverges from the convention the rest of the project uses | `int(event.data.<field>) > N` | `howto-route-messages.md` |
| DPS-SUB-013 | critical | streaming | In a `subscribe_with_handler` handler or a `client.subscribe(` loop, a path that neither returns a `TopicEventResponse` nor calls `respond_*` | The message is redelivered or dead-lettered | Respond on every path | `subscription-methods.md` |
| DPS-SUB-014 | warning | all | One app subscribes the same pubsub and topic via two or more types: a declarative Subscription scoped to it (or unscoped), plus programmatic code, plus streaming code | The precedence between types is undocumented; duplicate or missing delivery | Keep one type | `subscription-methods.md`; spec §3.1 |
| DPS-SUB-015 | critical | declarative | A Subscription `routes.default` or `rules[].path` with no matching POST endpoint (`@app.post`, `@router.post`) in the app(s) it is scoped to | Dapr receives a 404 and drops the message | Add the endpoint, or fix the path | `pubsub_api.md`; `subscription-methods.md` |
| DPS-SUB-016 | warning | streaming | The return value of `subscribe_with_handler(` is discarded or never called, or `client.subscribe(` has no `close()` in `finally` or shutdown | Leaked stream; no clean shutdown | Keep the close function and call it on shutdown (lifespan) or in `finally` | `python-client.md` |

DPS-SUB-001 and DPS-SUB-003 are .NET-only and are not part of this file; see `review-pubsub-subscriptions-dotnet.md`.

## Streaming notes (Python)

- A streaming handler that returns `TopicEventResponse("drop")` is not redelivered, but the message is still forwarded to the dead-letter topic when one is configured. Never describe DROP as silently discarded in a finding.
- A raw streaming subscription (`metadata={"rawPayload": "true"}`) expects raw publishers: `message.raw_data()` returns the original bytes. A CloudEvent publisher to the same subscription gives `raw_data()` as the full CloudEvent JSON envelope, so parsing it as the domain model fails. Use this in DPS-SUB-010 findings.
- With no `appPort` a streaming-only app is correct; do not report a missing `appPort` for it.

## Confidence notes

- DPS-SUB-006 — rules on idempotency evidence. Treat as satisfied when a check on the CloudEvent `id` or a business key (`in _processed`, `exists`, an upsert) is visible before the side effect. When the side effect is behind another function or service, report it under Please verify.
- DPS-SUB-015 — when the handler files are outside the review scope, report it under Please verify.
- DPS-SUB-014 — requires the app-id resolution from detection (`dapr.yaml` `appID`), so the Subscription `scopes` can be matched to the app.

## Baseline

The templates in [python-pubsub-subscriber-declarative.md](python-pubsub-subscriber-declarative.md), [python-pubsub-subscriber-programmatic.md](python-pubsub-subscriber-programmatic.md), [python-pubsub-subscriber-streaming.md](python-pubsub-subscriber-streaming.md) and [python-pubsub-handler.md](python-pubsub-handler.md) produce no critical or warning finding.
