using System.Collections.Concurrent;
using System.Text.Json;

namespace ProgrammaticApp;

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
