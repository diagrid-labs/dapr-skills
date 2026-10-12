namespace ShopOrdersApp.Models;

public sealed record AgentRunRequest(string Prompt, string? SessionId = null);

public sealed record AgentRunReply(string Output, string? SessionId);

public sealed record ToolResult(bool Success, string? Error);

public sealed record OrderStatus(string OrderId, string Status);

public sealed record StockLevel(string Sku, int UnitsInStock);

public sealed record Product(string Sku, string Name, decimal Price);

public sealed record Promotion(string Category, string Title, decimal DiscountPercent);
