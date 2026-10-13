using Dapr;
using Dapr.Client;

namespace Checkout;

public sealed class CheckoutPublisher(DaprClient daprClient, ILogger<CheckoutPublisher> logger)
{
    public Task PublishOrderAsync(OrderPlaced order)
    {
        _ = daprClient.PublishEventAsync("pubsub", "orders", order); // SEED DPS-PUB-001
        return Task.CompletedTask;
    }

    public async Task PublishOrderSafelyAsync(OrderPlaced order)
    {
        try { await daprClient.PublishEventAsync("pubsub", "orders", order); }
        catch (DaprException) // SEED DPS-PUB-002
        {
        }
    }

    public async Task PublishToBusAsync(OrderPlaced order)
    {
        await daprClient.PublishEventAsync("order-bus", "orders", order); // SEED DPS-PUB-003
    }

    public async Task PublishAuditAsync(OrderPlaced order)
    {
        using var client = new DaprClientBuilder().Build(); // SEED DPS-PUB-006
        await client.PublishEventAsync("pubsub", "audit", order);
    }

    public async Task PublishBatchAsync(List<OrderPlaced> orders)
    {
        await daprClient.BulkPublishEventAsync("pubsub", "orders", orders); // SEED DPS-PUB-007
    }

    public async Task PublishTracedAsync(OrderPlaced order)
    {
        var metadata = new Dictionary<string, string>
        {
            ["cloudevent.traceparent"] = "00-abc-def-01", // SEED DPS-PUB-008
        };
        await daprClient.PublishEventAsync("pubsub", "orders", order, metadata); // SEED DPS-PUB-009
    }

    public async Task PublishHistoryAsync(IEnumerable<OrderPlaced> allOrders)
    {
        await daprClient.PublishEventAsync("pubsub", "order-history", allOrders.ToList()); // SEED DPS-PUB-010
        logger.LogInformation("Published order history");
    }

    public async Task PublishRawAsync(OrderPlaced order)
    {
        var metadata = new Dictionary<string, string>
        {
            ["rawPayload"] = "true", // SEED DPS-PUB-012
        };
        await daprClient.PublishEventAsync("pubsub", "orders", order, metadata);
    }
}
