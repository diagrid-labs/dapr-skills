namespace ProgrammaticApp;

public sealed record OrderPlaced(string OrderId, string CustomerId, decimal Amount, DateTimeOffset PlacedAt);

public static class PubSubNames
{
    public const string PubSubName = "pubsub";
    public const string OrdersTopic = "orders";
    public const string OrdersDeadLetterTopic = "orders-deadletter";
}
