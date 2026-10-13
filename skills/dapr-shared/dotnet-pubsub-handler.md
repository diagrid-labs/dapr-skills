# Order handler and dead-letter handler (.NET)

One handler class holds the business logic for every HTTP-pushed subscription type (declarative and programmatic). Replace `<ProjectNamespace>` with the namespace of the project the file lives in. The streaming equivalent is in [dotnet-pubsub-messaging.md](dotnet-pubsub-messaging.md).

## OrderPlacedHandler

```csharp
using System.Collections.Concurrent;
using System.Text.Json;

namespace <ProjectNamespace>;

public interface IProcessedOrders
{
    bool IsProcessed(string orderId);
    void MarkProcessed(string orderId);
}

public sealed class InMemoryProcessedOrders : IProcessedOrders
{
    private readonly ConcurrentDictionary<string, byte> _processed = new();
    public bool IsProcessed(string orderId) => _processed.ContainsKey(orderId);
    public void MarkProcessed(string orderId) => _processed.TryAdd(orderId, 0);
}

public sealed class OrderPlacedHandler(IProcessedOrders processedOrders, ILogger<OrderPlacedHandler> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IResult> HandleAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        OrderPlaced? order;
        try
        {
            order = await JsonSerializer.DeserializeAsync<OrderPlaced>(request.Body, JsonOptions, cancellationToken);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Dropping malformed order event");
            return Drop();
        }

        if (order is null || string.IsNullOrWhiteSpace(order.OrderId) || order.Amount <= 0)
        {
            logger.LogWarning("Dropping invalid order event");
            return Drop();
        }

        if (processedOrders.IsProcessed(order.OrderId))
        {
            logger.LogInformation("Order {OrderId} was already processed; acknowledging the duplicate", order.OrderId);
            return Success();
        }

        logger.LogInformation("Order {OrderId} received: {Amount} for customer {CustomerId}", order.OrderId, order.Amount, order.CustomerId);
        processedOrders.MarkProcessed(order.OrderId);
        return Success();
    }

    public static IResult Success() => Results.Ok(new { status = "SUCCESS" });
    public static IResult Drop() => Results.Ok(new { status = "DROP" });
}
```

## Dead-letter handler

```csharp
namespace <ProjectNamespace>;

public sealed class DeadLetterLogger(ILogger<DeadLetterLogger> logger)
{
    public async Task<IResult> HandleAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(request.Body);
        var body = await reader.ReadToEndAsync(cancellationToken);
        logger.LogError("Dead-lettered order event: {Body}", body);
        return OrderPlacedHandler.Success();
    }
}
```

Registration:

```csharp
builder.Services.AddSingleton<IProcessedOrders, InMemoryProcessedOrders>();
builder.Services.AddSingleton<OrderPlacedHandler>();
builder.Services.AddSingleton<DeadLetterLogger>();
```

## Key points

- The body is read with `JsonSerializer` (not model binding), so malformed input becomes DROP instead of an automatic 400, which Dapr would retry forever.
- Invalid input returns DROP. DROP is not redelivered; it discards the message, or forwards it to the dead-letter topic when the subscription configures one (verified). A dead-letter route therefore also sees DROPped messages.
- Duplicates return SUCCESS.
- Transient failures must throw: ASP.NET Core returns 500 and Dapr retries according to the resiliency policy, and after the retries it forwards the message to the dead-letter topic.
- Replace `InMemoryProcessedOrders` with a state store before production; it is lost on restart and not shared between replicas.
- With `UseCloudEvents()`, raw subscriptions also arrive as the decoded bytes, so the same handler works for both.
- `JsonSerializerDefaults.Web` is used because `JsonSerializerOptions.Web` does not exist on net8.0.
- A controller action returning `Task<IResult>` executes the result on net8.0 and net10.0 (verified), so the same handler serves the minimal API and controller forms.
- The dead-letter route receives the unwrapped payload when `UseCloudEvents` is on.
