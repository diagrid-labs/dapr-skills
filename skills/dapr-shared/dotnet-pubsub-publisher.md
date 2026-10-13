# Publisher (.NET)

Code for publishing `OrderPlaced` events to the `orders` topic with `DaprClient` from `Dapr.AspNetCore` 1.18.10. Replace `<ProjectNamespace>` with the namespace of the project the file lives in.

## Message contract

In a create skill with role `both`, the contract goes in `<ProjectRoot>.Contracts/OrderPlaced.cs` and `<ProjectRoot>.Contracts/PubSubNames.cs`. In every other case it goes in the `Models` folder of the project.

```csharp
namespace <ProjectNamespace>;

public sealed record OrderPlaced(string OrderId, string CustomerId, decimal Amount, DateTimeOffset PlacedAt);
```

```csharp
namespace <ProjectNamespace>;

public static class PubSubNames
{
    public const string PubSubName = "pubsub";
    public const string OrdersTopic = "orders";
    public const string OrdersDeadLetterTopic = "orders-deadletter";
}
```

When an add skill reuses an existing pub/sub component with another name, `PubSubName` takes that name.

## OrderPublisher

```csharp
using Dapr.Client;

namespace <ProjectNamespace>;

public sealed record PublishFeatures(int? TtlInSeconds = null, bool RawPayload = false);

public sealed class OrderPublisher(DaprClient daprClient, ILogger<OrderPublisher> logger)
{
    public Task PublishOrderPlacedAsync(OrderPlaced order, CancellationToken cancellationToken = default) =>
        PublishOrderPlacedAsync(order, new PublishFeatures(), cancellationToken);

    public async Task PublishOrderPlacedAsync(OrderPlaced order, PublishFeatures features, CancellationToken cancellationToken = default)
    {
        var metadata = new Dictionary<string, string>();
        if (features.TtlInSeconds is { } ttl)
        {
            metadata["ttlInSeconds"] = ttl.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
        if (features.RawPayload)
        {
            metadata["rawPayload"] = "true";
        }

        await daprClient.PublishEventAsync(PubSubNames.PubSubName, PubSubNames.OrdersTopic, order, metadata, cancellationToken);
        logger.LogInformation("Published order {OrderId} to {Topic}", order.OrderId, PubSubNames.OrdersTopic);
    }
}
```

## Publish endpoint (minimal API)

In `Program.cs`, after `var app = builder.Build();`:

```csharp
app.MapPost("/orders", async (OrderPlaced order, OrderPublisher publisher, CancellationToken cancellationToken) =>
{
    try
    {
        await publisher.PublishOrderPlacedAsync(order, cancellationToken);
        return Results.Accepted($"/orders/{order.OrderId}", new { order.OrderId });
    }
    catch (Dapr.DaprException ex)
    {
        return Results.Problem(title: "Publishing the order failed", detail: ex.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});
```

## Publish endpoint (controller)

`Controllers/OrdersController.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;

namespace <ProjectNamespace>.Controllers;

[ApiController]
[Route("orders")]
public sealed class OrdersController(OrderPublisher publisher) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> PlaceAsync(OrderPlaced order, CancellationToken cancellationToken)
    {
        try
        {
            await publisher.PublishOrderPlacedAsync(order, cancellationToken);
            return Accepted($"/orders/{order.OrderId}", new { order.OrderId });
        }
        catch (Dapr.DaprException ex)
        {
            return Problem(title: "Publishing the order failed", detail: ex.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }
}
```

## Registration

- Minimal API: `builder.Services.AddDaprClient();` and `builder.Services.AddSingleton<OrderPublisher>();`.
- Controllers: `builder.Services.AddControllers().AddDapr();` (this also registers `DaprClient`) and `builder.Services.AddSingleton<OrderPublisher>();`.
- In an add skill, skip `AddDaprClient()` when the project already has `AddDaprClient(` or `.AddDapr(`.

## Adding to an existing Program.cs or Startup.cs

- `Program.cs`: put the registrations after the last `builder.Services.Add*` line, and the endpoint after the last `app.Map*` line.
- `Startup.cs`: put the registrations in `ConfigureServices`, and the endpoint inside `app.UseEndpoints(endpoints => { ... })` as `endpoints.MapPost(...)`.
- In an add skill the route is `/pubsub/orders`. When the user accepts "publish from the existing endpoint", the existing handler gains an `OrderPublisher publisher` parameter and calls `await publisher.PublishOrderPlacedAsync(new OrderPlaced(...), cancellationToken)` after its existing work succeeds. Its existing response stays unchanged.

## Recipe: bulk publish

Not scaffolded. Use it when the user asks for it:

```csharp
var response = await daprClient.BulkPublishEventAsync(PubSubNames.PubSubName, PubSubNames.OrdersTopic, orders, cancellationToken: cancellationToken);
if (response.FailedEntries.Count > 0)
{
    foreach (var failed in response.FailedEntries)
    {
        logger.LogError("Bulk publish failed for entry {EntryId}: {Error}", failed.Entry.EntryId, failed.ErrorMessage);
    }
    throw new InvalidOperationException($"{response.FailedEntries.Count} orders were not published.");
}
```

## Key points

- `DaprClient` is a singleton; do not create one per request.
- Always `await` the publish call.
- `DaprException` maps to 503, never to a success response. Verified: with no sidecar running the endpoint returns 503.
- Metadata values are strings (`ttlInSeconds`, `rawPayload`).
- Never set `cloudevent.trace*` metadata; the SDK and sidecar propagate trace context.
- The raw payload key is `rawPayload`. Raw payloads are not wrapped in a CloudEvent, so they lose tracing and CloudEvent-based dedupe.
- Never add `Dapr.Client` as a package reference; it comes in through `Dapr.AspNetCore`.
