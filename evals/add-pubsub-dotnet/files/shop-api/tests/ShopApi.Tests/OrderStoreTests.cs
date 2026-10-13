using Xunit;
using ShopApi.Models;
using ShopApi.Services;

namespace ShopApi.Tests;

public class OrderStoreTests
{
    [Fact]
    public void Add_then_Get_returns_the_order()
    {
        var store = new OrderStore();
        var order = new Order("o-1", "c-1", 25.50m);

        store.Add(order);

        Assert.Equal(order, store.Get("o-1"));
    }

    [Fact]
    public void Get_returns_null_for_unknown_id()
    {
        var store = new OrderStore();

        Assert.Null(store.Get("missing"));
    }
}
