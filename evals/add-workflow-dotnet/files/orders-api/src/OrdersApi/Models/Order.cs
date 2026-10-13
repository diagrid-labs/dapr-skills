namespace OrdersApi.Models;

public sealed record OrderLine(string Sku, int Quantity, decimal UnitPrice);

public sealed record Order(string Id, string CustomerEmail, IReadOnlyList<OrderLine> Lines)
{
    public decimal Total => Lines.Sum(l => l.Quantity * l.UnitPrice);
}
