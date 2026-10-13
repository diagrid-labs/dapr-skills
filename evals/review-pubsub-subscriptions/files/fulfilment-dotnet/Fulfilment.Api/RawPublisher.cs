using Dapr.Client;

namespace Fulfilment.Api;

public sealed class RawPublisher(DaprClient daprClient)
{
    public async Task PublishAsync(OrderPlaced order, CancellationToken cancellationToken = default)
    {
        var metadata = new Dictionary<string, string>
        {
            ["rawPayload"] = "true", // SEED DPS-SUB-010
        };

        await daprClient.PublishEventAsync("pubsub", "orders", order, metadata, cancellationToken);
    }
}
