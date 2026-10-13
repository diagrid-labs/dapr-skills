# Declarative subscriber (.NET)

The subscription lives in `resources/subscription.yaml` (see [dapr-pubsub-subscription.md](dapr-pubsub-subscription.md)); the code only maps the routes the YAML names. The handlers are in [dotnet-pubsub-handler.md](dotnet-pubsub-handler.md). Replace `<ProjectNamespace>` with the namespace of the project the file lives in. `Dapr.AspNetCore` 1.18.10 is referenced for `UseCloudEvents`.

## Minimal API form

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IProcessedOrders, InMemoryProcessedOrders>();
builder.Services.AddSingleton<OrderPlacedHandler>();
builder.Services.AddSingleton<DeadLetterLogger>();

var app = builder.Build();

app.UseCloudEvents();

app.MapPost("/events/pubsub/orders",
    (HttpRequest request, OrderPlacedHandler handler, CancellationToken cancellationToken) =>
        handler.HandleAsync(request, cancellationToken));

app.MapPost("/events/pubsub/orders-deadletter",
    (HttpRequest request, DeadLetterLogger deadLetters, CancellationToken cancellationToken) =>
        deadLetters.HandleAsync(request, cancellationToken));

app.Run();
```

Plus `resources/subscription.yaml` from `dapr-pubsub-subscription.md`.

## Controller form

- `builder.Services.AddControllers();`. Add `.AddDapr()` only when the same project also publishes.
- `app.UseCloudEvents(); app.MapControllers();`

```csharp
using Microsoft.AspNetCore.Mvc;

namespace <ProjectNamespace>.Controllers;

[ApiController]
public sealed class OrderEventsController(OrderPlacedHandler handler, DeadLetterLogger deadLetters) : ControllerBase
{
    [HttpPost("/events/pubsub/orders")]
    public Task<IResult> OrdersAsync(CancellationToken cancellationToken) =>
        handler.HandleAsync(Request, cancellationToken);

    [HttpPost("/events/pubsub/orders-deadletter")]
    public Task<IResult> OrdersDeadLetterAsync(CancellationToken cancellationToken) =>
        deadLetters.HandleAsync(Request, cancellationToken);
}
```

## Routing rules

Add `app.MapPost("/events/pubsub/orders/large", ...)` (or `[HttpPost("/events/pubsub/orders/large")]`) that calls the same handler, plus the YAML `rules` block from `dapr-pubsub-subscription.md`. The `match` expression and the path live in the YAML only; the code never repeats them.

## Raw payload

Set `spec.metadata.rawPayload: "true"` in the YAML. No code change is needed: `UseCloudEvents` decodes `data_base64` into the body, so `OrderPlacedHandler` reads the same bytes either way. The metadata key is exactly `rawPayload`.

## Startup.cs placement

```csharp
app.UseRouting();
app.UseCloudEvents();
app.UseEndpoints(endpoints =>
{
    endpoints.MapPost("/events/pubsub/orders", ...);
});
```

`UseCloudEvents` must come **before** `UseEndpoints`.

## SDK-free alternative

Documented only, not scaffolded. Bind a local envelope record and read `.Data`:

```csharp
public sealed record CloudEventEnvelope<T>(string Id, string Source, string Type, T? Data);
```

This works without `Dapr.AspNetCore`, but loses raw-payload decoding.

## Key points

- There is no `MapSubscribeHandler`, `WithTopic` or `[Topic]` in a declarative subscriber: the YAML is the subscription.
- `UseCloudEvents()` is still required, and must come before any `Map*` subscriber route. Without it the typed body binds the CloudEvent envelope and every field is null.
- Every route in the YAML must exist here; a missing route returns 404 and the message is dropped.
- `scopes` in the YAML must equal the app-id of this app.
- The subscription file hot-reloads when it changes in the resources folder.
- Verified: plain `MapPost` handlers with `UseCloudEvents()` and a v2alpha1 `subscription.yaml` receive `OrderPlaced`; the sidecar logs `Found Subscription: orders-subscription`.
- Never add a programmatic subscription for the same topic in the same app.
