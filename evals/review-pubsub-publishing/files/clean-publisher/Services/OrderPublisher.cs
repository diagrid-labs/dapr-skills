using Dapr.Client;

namespace CleanPublisher;

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
