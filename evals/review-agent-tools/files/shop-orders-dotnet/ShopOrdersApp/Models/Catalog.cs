namespace ShopOrdersApp.Models;

internal static class Catalog
{
    private static readonly Product[] Products =
    [
        new("CBL-USBC-1M", "USB-C cable 1m", 9.95m),
        new("CBL-USBC-2M", "USB-C cable 2m", 12.95m),
        new("CHG-65W", "65W USB-C charger", 39.00m),
    ];

    private static readonly Dictionary<string, int> Stock = new()
    {
        ["CBL-USBC-1M"] = 120,
        ["CBL-USBC-2M"] = 45,
        ["CHG-65W"] = 8,
    };

    public static readonly Promotion[] Promotions =
    [
        new("cables", "Two cables for the price of one", 50m),
        new("chargers", "Spring charger sale", 15m),
    ];

    public static IEnumerable<Product> Search(string query) =>
        Products.Where(p => p.Name.Contains(query, StringComparison.OrdinalIgnoreCase));

    public static int StockFor(string sku) => Stock.TryGetValue(sku, out var units) ? units : 0;
}
