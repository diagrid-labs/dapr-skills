using System.ComponentModel;
using Microsoft.Extensions.AI;
using ShopOrdersApp.Models;

namespace ShopOrdersApp.Tools;

internal static class CatalogTools
{
    public static AIFunction SearchCatalog { get; } = AIFunctionFactory.Create(
        ([Description("Free-text search term, e.g. 'usb-c cable'.")] string query) =>
            Catalog.Search(query).Take(10).ToList(),
        name: "SearchCatalog",
        description: "Search the product catalog and return at most 10 matching products with SKU and price.");

    public static AIFunction LookupStock { get; } = AIFunctionFactory.Create(LookupStockImpl);

    public static AIFunction ListPromotions { get; } = AIFunctionFactory.Create(ListPromotionsImpl, name: "ListPromotions");

    [Description("Return the number of units in stock for a SKU.")]
    private static StockLevel LookupStockImpl(
        [Description("Product SKU, e.g. 'CHG-65W'.")] string sku) =>
        new(sku, Catalog.StockFor(sku));

    private static IReadOnlyList<Promotion> ListPromotionsImpl(
        [Description("Product category, e.g. 'cables'.")] string category) =>
        Catalog.Promotions.Where(p => p.Category == category).Take(5).ToList();
}
