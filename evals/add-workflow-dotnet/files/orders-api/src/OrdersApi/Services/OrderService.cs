using System.Collections.Concurrent;
using OrdersApi.Models;

namespace OrdersApi.Services;

public sealed class OrderService
{
    private readonly ConcurrentDictionary<string, Order> _orders = new();

    public Order Add(Order order)
    {
        if (order.Lines.Count == 0)
        {
            throw new ArgumentException("An order needs at least one line.", nameof(order));
        }

        _orders[order.Id] = order;
        return order;
    }

    public Order? Get(string id) => _orders.TryGetValue(id, out var order) ? order : null;
}
