namespace Fulfilment.Api;

public sealed record OrderPlaced(string OrderId, string CustomerId, decimal Amount);
