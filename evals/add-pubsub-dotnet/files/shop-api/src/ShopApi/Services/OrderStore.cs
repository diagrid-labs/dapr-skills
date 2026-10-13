using System.Collections.Concurrent;
using ShopApi.Models;

namespace ShopApi.Services;

public sealed class OrderStore
{
    private readonly ConcurrentDictionary<string, Order> _orders = new();

    public void Add(Order order) => _orders[order.Id] = order;

    public Order? Get(string id) => _orders.TryGetValue(id, out var order) ? order : null;
}
