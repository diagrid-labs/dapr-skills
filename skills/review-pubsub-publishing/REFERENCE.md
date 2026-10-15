# Reference: Review Dapr Pub/sub — Publishing

This skill is read-only and operates entirely on existing source. The detailed rule tables live in the per-language checklist shards in [`../dapr-shared/`](../dapr-shared/).

## Source rule corpus

The baseline for correct publishing comes from the pub/sub authoring templates:

- .NET publisher: [`../dapr-shared/dotnet-pubsub-publisher.md`](../dapr-shared/dotnet-pubsub-publisher.md)
- Python publisher: [`../dapr-shared/python-pubsub-publisher.md`](../dapr-shared/python-pubsub-publisher.md)

Those templates are written with placeholders ([`../dapr-shared/pubsub-placeholders.md`](../dapr-shared/pubsub-placeholders.md)), so the baseline is their *shape* — awaited publish, shared topic constants, 503 on a Dapr failure, string metadata values — never the identifiers in them. Reviewed code uses the names of its own domain; never report a finding because a type, topic or method is named differently from a template. The worked examples below use one concrete domain for readability only.

The per-language checklist shards translate those expectations into greppable patterns and stable rule ids. Each shard states that its baseline publisher produces no finding:

- [`../dapr-shared/review-pubsub-publishing-dotnet.md`](../dapr-shared/review-pubsub-publishing-dotnet.md)
- [`../dapr-shared/review-pubsub-publishing-python.md`](../dapr-shared/review-pubsub-publishing-python.md)

## Worked example

Given this trimmed `CheckoutService.cs`:

```csharp
using Dapr.Client;
using Microsoft.AspNetCore.Http;

namespace Checkout;

public class CheckoutService
{
    private readonly DaprClient _client;

    public CheckoutService(DaprClient client) => _client = client;

    public IResult PlaceOrder(OrderPlaced order)
    {
        _ = _client.PublishEventAsync(PubSubNames.PubSubName, PubSubNames.OrdersTopic, order);
        return Results.Accepted();
    }

    public async Task<IResult> PlaceOrderSafe(OrderPlaced order)
    {
        try
        { await _client.PublishEventAsync(PubSubNames.PubSubName, PubSubNames.OrdersTopic, order); }
        catch (DaprException) { }
        return Results.Ok();
    }
}
```

The expected report:

```text
# Dapr review — review-pubsub-publishing

Target: Checkout/
Language: dotnet
Found: 2 critical, 0 warnings, 0 suggestions, 0 to verify

## Critical
- [DPS-PUB-001] `CheckoutService.cs:14` — `PublishEventAsync` task is discarded with `_ =`
  Why: the failure is never observed; the event may never be sent.
  Fix: `await` the call (and make `PlaceOrder` async).
- [DPS-PUB-002] `CheckoutService.cs:22` — empty `catch (DaprException)` around the publish, then returns 200
  Why: the caller believes the event was published.
  Fix: rethrow, or return 503 / `Results.Problem(...)` from the catch.

## Next steps
- Run `review-pubsub-subscriptions` on the same scope.
- Run `review-pubsub-components` to check the `pubsub` component name used by `PubSubNames.PubSubName`.
```

## Python worked example

Given this publisher:

```python
@app.post("/orders")
async def place_order(order: OrderPlaced):
    with DaprClient() as client:
        client.publish_event(
            pubsub_name=PUBSUB_NAME,
            topic_name=ORDERS_TOPIC,
            data=order.model_dump(),
            data_content_type="application/json",
        )
    return {"status": "published"}
```

`data=order.model_dump()` passes a dict where `str` or `bytes` is required, which raises a `ValueError` or `TypeError` before anything is published. The expected finding:

```text
## Critical
- [DPS-PUB-004] `main.py:7` — `data=` is a dict from `model_dump()`, not `str` or `bytes`
  Why: the SDK raises before publishing, so the order is never sent.
  Fix: use `data=order.model_dump_json()`.
```

The sync client (`with DaprClient() as client:` then `client.publish_event(`) inside `async def` is also the `DPS-PUB-011` shape (info, a sync `DaprClient` publish inside `async def`); a full report lists it under `## Suggestions`.

## Out of scope

- Subscriber routes, handlers, subscription types and dead-letter handling — covered by `review-pubsub-subscriptions`.
- Component YAML, `Subscription` YAML, resiliency policies and run configuration — covered by `review-pubsub-components`.
- Components named `agent-pubsub` — covered by `review-agent-orchestration`.
