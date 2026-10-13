namespace Fulfilment.Worker;

public sealed record OrderPlaced(string OrderId, string CustomerId, decimal Amount);

public sealed class FulfilmentDb
{
    public List<OrderPlaced> Orders { get; } = new();

    public Task SaveChangesAsync() => Task.CompletedTask;
}

public static class KnownCustomers
{
    private static readonly HashSet<string> Ids = ["c-100", "c-200", "c-300"];

    public static bool Contains(string customerId) => Ids.Contains(customerId);
}
