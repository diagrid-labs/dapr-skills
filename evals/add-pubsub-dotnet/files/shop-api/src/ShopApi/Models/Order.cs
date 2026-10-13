namespace ShopApi.Models;

public sealed record Order(string Id, string CustomerId, decimal Amount);
