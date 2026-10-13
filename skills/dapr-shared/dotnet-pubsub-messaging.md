# Streaming subscriber with Dapr.Messaging (.NET)

The streaming subscriber uses `Dapr.Messaging` 1.18.10 (`[DaprTopic]`, `ITopicHandler<T>`). The app opens an outbound gRPC stream to the sidecar, so no inbound HTTP port is needed. Replace `<ProjectNamespace>` with the namespace of the project the file lives in. The contract and `PubSubNames` are in [dotnet-pubsub-publisher.md](dotnet-pubsub-publisher.md).

## Streaming subscriber

csproj:

```xml
<PackageReference Include="Dapr.Messaging" Version="1.18.10" />
```

`Program.cs`:

```csharp
builder.Services.AddSingleton<IProcessedOrders, InMemoryProcessedOrders>();
builder.Services.AddDaprMessaging(options =>
    options.DaprGrpcEndpoint = $"http://localhost:{Environment.GetEnvironmentVariable("DAPR_GRPC_PORT") ?? "50001"}");
```

No `Map*` call is needed for streaming. In a create skill the subscriber's `dapr.yaml` entry has no `appPort`; the `dapr run` command exports `DAPR_GRPC_PORT` to the app, and so does the Aspire Dapr integration.

Order handler:

```csharp
using Dapr.Messaging;
using Dapr.Messaging.PublishSubscribe;

namespace <ProjectNamespace>;

[DaprTopic(PubSubNames.PubSubName, PubSubNames.OrdersTopic, Delivery = DeliveryMode.Streaming, DeadLetterTopic = PubSubNames.OrdersDeadLetterTopic)]
public sealed class OrderPlacedTopicHandler(IProcessedOrders processedOrders, ILogger<OrderPlacedTopicHandler> logger) : ITopicHandler<OrderPlaced>
{
    public Task<TopicResponseAction> HandleAsync(OrderPlaced order, TopicContext context, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(order.OrderId) || order.Amount <= 0)
        {
            logger.LogWarning("Dropping invalid order event {MessageId}", context.MessageId);
            return Task.FromResult(TopicResponseAction.Drop);
        }

        if (processedOrders.IsProcessed(order.OrderId))
        {
            logger.LogInformation("Order {OrderId} was already processed; acknowledging the duplicate", order.OrderId);
            return Task.FromResult(TopicResponseAction.Success);
        }

        logger.LogInformation("Order {OrderId} received via streaming: {Amount} for customer {CustomerId}", order.OrderId, order.Amount, order.CustomerId);
        processedOrders.MarkProcessed(order.OrderId);
        return Task.FromResult(TopicResponseAction.Success);
    }
}
```

Dead-letter handler:

```csharp
using Dapr.Messaging;
using Dapr.Messaging.PublishSubscribe;

namespace <ProjectNamespace>;

[DaprTopic(PubSubNames.PubSubName, PubSubNames.OrdersDeadLetterTopic, Delivery = DeliveryMode.Streaming)]
public sealed class OrdersDeadLetterTopicHandler(ILogger<OrdersDeadLetterTopicHandler> logger) : ITopicHandler<OrderPlaced>
{
    public Task<TopicResponseAction> HandleAsync(OrderPlaced order, TopicContext context, CancellationToken cancellationToken)
    {
        logger.LogError("Dead-lettered order {OrderId} (message {MessageId})", order.OrderId, context.MessageId);
        return Task.FromResult(TopicResponseAction.Success);
    }
}
```

Raw payload: set `EnableRawPayload = true` on `[DaprTopic]`.

Notes from verification:

- `Dapr.Messaging` 1.18.10 with a bare `AddDaprMessaging()` never opened the gRPC stream when running under `dapr run` (observed on Windows): the sidecar never logged `Subscribing to pubsub`. Setting `DaprGrpcEndpoint` from `DAPR_GRPC_PORT` fixes it, and the sidecar then logs `Subscribing to pubsub 'pubsub' topic 'orders'`. Setting only the `DAPR_GRPC_ENDPOINT` environment variable did not help.
- `MapDaprMessaging()` is not needed for streaming.
- A body that cannot be deserialized into `OrderPlaced` throws in the generated dispatcher, before `HandleAsync` runs. The handler cannot return `Drop` for it: the subscription faults (`The streaming subscription ... faulted; reconnecting in 00:00:05`), the message is not acknowledged, and it is redelivered after every reconnect, delaying later messages. The handler can only `Drop` semantically invalid orders (empty `OrderId`, amount <= 0). Mitigate by keeping the contract lenient (nullable members) and by relying on the sidecar's resiliency and dead-letter policy. Raw non-JSON bytes never reach the app: the sidecar logs a deserialization error and dead-letters the message.
- The build warning `DAPR1612` (message type not registered in a `JsonSerializerContext`) only matters for native AOT and is harmless here.
- `TopicResponseAction.Drop` is not redelivered, and is also forwarded to the dead-letter topic when one is configured.

## Publishing with IDaprPublishSubscribeClient

Use this when one project both publishes and uses `Dapr.Messaging`, so only one package and one registration are needed. `AddDaprMessaging()` registers `IDaprPublishSubscribeClient`.

```csharp
using Dapr.Messaging;

app.MapPost("/pubsub/orders", async (OrderPlaced order, IDaprPublishSubscribeClient client, CancellationToken cancellationToken) =>
{
    try
    {
        await client.PublishEventAsync(PubSubNames.PubSubName, PubSubNames.OrdersTopic, order, cancellationToken);
        return Results.Accepted($"/orders/{order.OrderId}", new { order.OrderId });
    }
    catch (Dapr.DaprException ex)
    {
        return Results.Problem(title: "Publishing the order failed", detail: ex.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});
```

For a trigger-endpoint edit or a controller, wrap the client in the same `OrderPublisher` shape as the `DaprClient` publisher, so the endpoints in [dotnet-pubsub-publisher.md](dotnet-pubsub-publisher.md) work unchanged:

```csharp
using Dapr.Messaging;

namespace <ProjectNamespace>;

public sealed record PublishFeatures(int? TtlInSeconds = null, bool RawPayload = false);

public sealed class OrderPublisher(IDaprPublishSubscribeClient client, ILogger<OrderPublisher> logger)
{
    public Task PublishOrderPlacedAsync(OrderPlaced order, CancellationToken cancellationToken = default) =>
        PublishOrderPlacedAsync(order, new PublishFeatures(), cancellationToken);

    public async Task PublishOrderPlacedAsync(OrderPlaced order, PublishFeatures features, CancellationToken cancellationToken = default)
    {
        var options = new PublishOptions();
        if (features.TtlInSeconds is { } ttl)
        {
            options.Metadata["ttlInSeconds"] = ttl.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
        if (features.RawPayload)
        {
            options.Metadata["rawPayload"] = "true";
        }

        await client.PublishEventAsync(PubSubNames.PubSubName, PubSubNames.OrdersTopic, order, options, cancellationToken);
        logger.LogInformation("Published order {OrderId} to {Topic}", order.OrderId, PubSubNames.OrdersTopic);
    }
}
```

Register it with `builder.Services.AddSingleton<OrderPublisher>();` next to `AddDaprMessaging(...)`; no `AddDaprClient()`. Failures surface as `Dapr.DaprException`, so the 503 mapping in the publish endpoints is unchanged.

## Following an existing Http or Programmatic delivery project

Only when the project already uses `[DaprTopic]` with `Delivery = DeliveryMode.Http` or `DeliveryMode.Programmatic` (never scaffolded): use the same `Delivery` value as the existing handlers, and call `app.MapDaprMessaging()` once. Streaming handlers need none of this.

## Analyzer diagnostics

Generator errors:

- DAPR1601: a type annotated with `[DaprTopic]` does not implement `ITopicHandler<T>`.
- DAPR1602: the `[DaprTopic]` type is not a class (records, structs and interfaces are not supported).
- DAPR1603: the same topic and delivery mode is registered by more than one `[DaprTopic]`.
- DAPR1605: a `Match` expression is declared without a `Priority`.

Analyzer diagnostics:

- DAPR1610 (warning): the same topic is registered for more than one delivery mode.
- DAPR1611 (error): a `[DaprTopic]` type does not implement `ITopicHandler<T>`.
- DAPR1612 (warning): the message type is not registered in a `JsonSerializerContext` (native AOT only).
- DAPR1613 (warning): programmatic subscriptions need `app.MapDaprAppCallback()` (or `MapDaprMessaging()`).
- DAPR1614 (warning): do not call `DaprMessagingRegistration` directly; call `AddDaprMessaging()`.

- DAPR1615 (warning): a subscriber registration or `Map*` call exists with no matching subscribers; remove it.
- DAPR1616 (warning): a `[DaprTopic]` feature is enabled without its companion properties.
- DAPR1617 (warning): a `[DaprTopic]` property is ignored for the selected delivery mode (for example `Match`, `Priority`, `Route` or bulk on Streaming).

DAPR1601 (generator) and DAPR1611 (analyzer) describe the same condition; either can fire.

## Known sample pitfalls

- Upstream example 07 injects `IDaprPublishSubscribeClient` after only `AddDaprPubSubClient()`; always use `AddDaprMessaging()`.
- Upstream examples 03 and 04 set `Match` and `BulkSubscribe` on Streaming, where both are ignored (DAPR1617).

## Key points

- Namespaces: the publish snippet needs `using Dapr.Messaging;`; the handler snippets need both `using Dapr.Messaging;` and `using Dapr.Messaging.PublishSubscribe;`.
- Handlers are resolved per message from a new scope, so scoped dependencies work.
- Streaming never sets `Route`, `Match`, `Priority` or `BulkSubscribe`.
- No `appPort` is needed, but the gRPC endpoint must be set as shown (`DAPR_GRPC_PORT`).
- There is no minimal API or controller choice: subscribers are handler classes.
- Never mix `[DaprTopic]` with `[Topic]`, `WithTopic` or a Subscription YAML for the same topic.
- Requires `Dapr.Messaging` 1.18.8 or later; pin 1.18.10.
