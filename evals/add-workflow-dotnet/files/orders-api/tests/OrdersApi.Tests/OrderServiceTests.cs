using OrdersApi.Models;
using OrdersApi.Services;
using Xunit;

namespace OrdersApi.Tests;

public class OrderServiceTests
{
    [Fact]
    public void Add_then_Get_returns_the_order()
    {
        var service = new OrderService();
        var order = new Order("o-1", "jane@example.com", [new OrderLine("SKU-1", 2, 10m)]);

        service.Add(order);

        Assert.Equal(20m, service.Get("o-1")!.Total);
    }

    [Fact]
    public void Add_rejects_an_empty_order()
    {
        var service = new OrderService();

        Assert.Throws<ArgumentException>(() => service.Add(new Order("o-2", "jane@example.com", [])));
    }
}
