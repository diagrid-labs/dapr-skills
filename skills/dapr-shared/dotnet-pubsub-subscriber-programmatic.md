# Programmatic subscriber (.NET)

The app tells the sidecar what it subscribes to, through `GET /dapr/subscribe`. The handlers are in [dotnet-pubsub-handler.md](dotnet-pubsub-handler.md). Replace `<ProjectNamespace>` with the namespace of the project the file lives in. `Dapr.AspNetCore` 1.18.10 provides `UseCloudEvents`, `MapSubscribeHandler`, `WithTopic` and `[Topic]`.

## Minimal API form

The registrations are the same as the declarative form:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IProcessedOrders, InMemoryProcessedOrders>();
builder.Services.AddSingleton<OrderPlacedHandler>();
builder.Services.AddSingleton<DeadLetterLogger>();

var app = builder.Build();
```

Then (add `using Dapr;` at the top of `Program.cs`, before the first statement):

```csharp
app.UseCloudEvents();
app.MapSubscribeHandler();

app.MapPost("/events/pubsub/orders",
        (HttpRequest request, OrderPlacedHandler handler, CancellationToken cancellationToken) =>
            handler.HandleAsync(request, cancellationToken))
    .WithTopic(new TopicOptions
    {
        PubsubName = PubSubNames.PubSubName,
        Name = PubSubNames.OrdersTopic,
        DeadLetterTopic = PubSubNames.OrdersDeadLetterTopic,
    });

app.MapPost("/events/pubsub/orders-deadletter",
        (HttpRequest request, DeadLetterLogger deadLetters, CancellationToken cancellationToken) =>
            deadLetters.HandleAsync(request, cancellationToken))
    .WithTopic(PubSubNames.PubSubName, PubSubNames.OrdersDeadLetterTopic);

app.Run();
```

## Controller form

`builder.Services.AddControllers().AddDapr();`, then `app.UseCloudEvents(); app.MapSubscribeHandler(); app.MapControllers();`, and the controller:

```csharp
using Dapr;
using Microsoft.AspNetCore.Mvc;

namespace <ProjectNamespace>.Controllers;

[ApiController]
public sealed class OrderEventsController(OrderPlacedHandler handler, DeadLetterLogger deadLetters) : ControllerBase
{
    [Topic(PubSubNames.PubSubName, PubSubNames.OrdersTopic, PubSubNames.OrdersDeadLetterTopic, false)]
    [HttpPost("/events/pubsub/orders")]
    public Task<IResult> OrdersAsync(CancellationToken cancellationToken) =>
        handler.HandleAsync(Request, cancellationToken);

    [Topic(PubSubNames.PubSubName, PubSubNames.OrdersDeadLetterTopic)]
    [HttpPost("/events/pubsub/orders-deadletter")]
    public Task<IResult> OrdersDeadLetterAsync(CancellationToken cancellationToken) =>
        deadLetters.HandleAsync(Request, cancellationToken);
}
```

## Routing rules

- Minimal API: add a second endpoint `/events/pubsub/orders/large` with `.WithTopic(new TopicOptions { PubsubName = PubSubNames.PubSubName, Name = PubSubNames.OrdersTopic, Match = "int(event.data.amount) > 1000", Priority = 1 })` that calls the same handler. The default endpoint keeps no `Match`.
- Controllers: add an action at `/events/pubsub/orders/large` with `[Topic(PubSubNames.PubSubName, PubSubNames.OrdersTopic, "int(event.data.amount) > 1000", 1)]`.
- If the default endpoint also carries the dead-letter topic, keep it on the default endpoint only.
- Verified: `/dapr/subscribe` advertises `routes.default` plus `routes.rules`, an order with amount 1500 reaches the rule endpoint and amount 10 reaches the default endpoint.

## Raw payload

Set `EnableRawPayload = true` in `TopicOptions`, or use `[Topic(PubSubNames.PubSubName, PubSubNames.OrdersTopic, true)]`. `UseCloudEvents` decodes the body, so `OrderPlacedHandler` is unchanged.

## Startup.cs placement

```csharp
app.UseRouting();
app.UseCloudEvents();
app.UseEndpoints(endpoints =>
{
    endpoints.MapSubscribeHandler();
    endpoints.MapControllers();
});
```

## Recipe: bulk subscribe

Not scaffolded. Add `.WithBulkSubscribe(new BulkSubscribeTopicOptions { TopicName = PubSubNames.OrdersTopic, MaxMessagesCount = 100, MaxAwaitDurationMs = 1000 })` to the endpoint, and write a handler that returns a `BulkSubscribeAppResponse` with one `BulkSubscribeAppResponseEntry(entryId, BulkSubscribeAppResponseStatus.SUCCESS)` per entry (use `RETRY` or `DROP` for entries that need them).

## Key points

- `MapSubscribeHandler()` publishes the list on `GET /dapr/subscribe`; the sidecar reads it **once, at start-up**, so restart the sidecar after changing a topic. The advertised route has no leading slash (`events/pubsub/orders`); that is normal.
- `UseCloudEvents()` must come before the endpoints, and before any `Map*` subscriber route. Without it the typed body binds the CloudEvent envelope and every field is null.
- Never also add a `subscription.yaml` for the same topic in the same app.
- `TopicOptions` and `TopicAttribute` are in namespace `Dapr`.
- DROP is not redelivered, and is also forwarded to the dead-letter topic when one is configured.
