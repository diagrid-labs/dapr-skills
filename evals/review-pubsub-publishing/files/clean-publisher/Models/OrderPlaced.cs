namespace CleanPublisher;

public sealed record OrderPlaced(string OrderId, string CustomerId, decimal Amount, DateTimeOffset PlacedAt);
