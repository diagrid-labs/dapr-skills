# Reference: Review Dapr Pub/sub — Subscriptions and Handlers

This skill is read-only and operates entirely on existing source. The detailed rule tables live in the per-language checklist shards in [`../dapr-shared/`](../dapr-shared/).

## Source rule corpus

The canonical baseline for subscribers comes from the pub/sub templates that the create and add skills share. The checklists end with a "Baseline" section naming the templates that must produce no critical or warning finding.

Target detection, including how `scopes` in a Subscription file are resolved to app ids, is defined in [`../dapr-shared/review-detect-target-pubsub.md`](../dapr-shared/review-detect-target-pubsub.md). The per-language checklist shards translate the expectations into greppable patterns, stable rule ids and a **Types** column:

- [`../dapr-shared/review-pubsub-subscriptions-dotnet.md`](../dapr-shared/review-pubsub-subscriptions-dotnet.md)
- [`../dapr-shared/review-pubsub-subscriptions-python.md`](../dapr-shared/review-pubsub-subscriptions-python.md)

## Worked example (declarative .NET)

Given this `resources/subscription.yaml`:

```yaml
apiVersion: dapr.io/v2alpha1
kind: Subscription
metadata:
  name: orders
spec:
  pubsubname: pubsub
  topic: orders
  routes:
    rules:
      - match: int(event.data.total) > 1000
        path: /events/pubsub/orders/large
    default: /events/pubsub/orders
scopes:
  - order-subscriber
```

and this trimmed `Program.cs` of the `order-subscriber` app:

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapPost("/events/pubsub/orders", (OrderPlaced order) =>
{
    Console.WriteLine($"Order {order.OrderId} received");
    return Results.Ok();
});

app.Run();
```

The `default` route has an endpoint, but nothing handles `/events/pubsub/orders/large` (`DPS-SUB-015`). The handler binds a typed `OrderPlaced` body and the app never calls `UseCloudEvents()` (`DPS-SUB-002`). There is no `MapSubscribeHandler()` and no `[Topic]` or `.WithTopic`, so `DPS-SUB-001` does not fire.

The expected report:

```text
# Dapr review — review-pubsub-subscriptions

Target: ./
Language: dotnet
Found: 2 critical, 0 warnings, 0 suggestions, 0 to verify

## Critical
- [DPS-SUB-002] `Program.cs:4` — typed `OrderPlaced` body and no `UseCloudEvents()` in the app
  Why: the CloudEvent envelope is bound instead of the data, so every field is null.
  Fix: call `app.UseCloudEvents()` after `UseRouting()` and before the endpoints.
- [DPS-SUB-015] `resources/subscription.yaml:11` — route `/events/pubsub/orders/large` has no matching POST endpoint
  Why: Dapr receives a 404 and drops the message.
  Fix: add `app.MapPost("/events/pubsub/orders/large", ...)`, or fix the path.

## Next steps
- Run `review-pubsub-components` to check the component and the Subscription's `scopes`.
- Run `review-pubsub-publishing` to check the code that publishes to `orders`.
```

## Worked example (Python streaming)

Given this trimmed `main.py` of a streaming-only subscriber:

```python
from dapr.clients import DaprClient
from dapr.clients.grpc.subscription import TopicEventResponse

client = DaprClient()

def handle(message):
    try:
        order = OrderPlaced.model_validate_json(message.data())
        upsert_order(order)  # idempotent upsert
    except Exception:
        logger.exception("failed")
        return
    return TopicEventResponse("success")

client.subscribe_with_handler(PUBSUB_NAME, ORDERS_TOPIC, handle)
```

The `except` path returns nothing, so the message is neither acknowledged nor rejected (`DPS-SUB-013`). The close function returned by `subscribe_with_handler` is discarded (`DPS-SUB-016`). The `upsert_order` call is an idempotent upsert, so `DPS-SUB-006` is not reported. The missing `appPort` is correct for a streaming-only app and is not reported.

The expected report:

```text
# Dapr review — review-pubsub-subscriptions

Target: ./
Language: python
Found: 1 critical, 1 warnings, 0 suggestions, 0 to verify

## Critical
- [DPS-SUB-013] `main.py:12` — the `except` path returns without a `TopicEventResponse`
  Why: the message is redelivered or dead-lettered without an explicit decision.
  Fix: return `TopicEventResponse("retry")` for transient errors or `TopicEventResponse("drop")` for permanent ones.

## Warnings
- [DPS-SUB-016] `main.py:15` — the close function returned by `subscribe_with_handler` is discarded
  Why: the stream leaks and cannot be closed cleanly on shutdown.
  Fix: keep the returned function and call it on shutdown (lifespan) or in `finally`.

## Next steps
- Run `review-pubsub-components` to check the component, resiliency and dead-letter configuration.
- Run `review-pubsub-publishing` to check the code that publishes to `orders`.
```

## Cross-type false positives to avoid

- A declarative-only .NET app without `MapSubscribeHandler()` — do not report `DPS-SUB-001`. The rule needs `[Topic]` or `.WithTopic`.
- A streaming handler — do not report `DPS-SUB-002`, `DPS-SUB-003` or `DPS-SUB-004`. Those rules apply to the HTTP types only (declarative and programmatic).
- `{"status":"DROP"}` (or `TopicResponseAction.Drop`) inside `catch (JsonException)` — do not report `DPS-SUB-005`. A catch of a deserialization or validation exception that returns DROP is exempt.
- A streaming-only subscriber with no `appPort` — correct, never a finding.
- A Subscription whose `scopes` name a different app than the one being reviewed — do not apply the cross-type pass to this app (`DPS-SUB-014`) or look for its endpoints here (`DPS-SUB-015`).

## Out of scope

- Publishing code (`PublishEventAsync`, `publish_event`) — covered by `review-pubsub-publishing`. Publishers are read only to cross-check raw payloads (`DPS-SUB-010`).
- Component, resiliency and run configuration — covered by `review-pubsub-components`.
- Agent pub/sub conventions (components named `agent-pubsub`) — covered by `review-agent-orchestration`.
