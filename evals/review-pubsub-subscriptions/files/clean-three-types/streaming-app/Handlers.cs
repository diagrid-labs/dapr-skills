using System.Collections.Concurrent;
using Dapr.Messaging;
using Dapr.Messaging.PublishSubscribe;

namespace StreamingApp;

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

[DaprTopic(PubSubNames.PubSubName, PubSubNames.OrdersDeadLetterTopic, Delivery = DeliveryMode.Streaming)]
public sealed class OrdersDeadLetterTopicHandler(ILogger<OrdersDeadLetterTopicHandler> logger) : ITopicHandler<OrderPlaced>
{
    public Task<TopicResponseAction> HandleAsync(OrderPlaced order, TopicContext context, CancellationToken cancellationToken)
    {
        logger.LogError("Dead-lettered order {OrderId} (message {MessageId})", order.OrderId, context.MessageId);
        return Task.FromResult(TopicResponseAction.Success);
    }
}
