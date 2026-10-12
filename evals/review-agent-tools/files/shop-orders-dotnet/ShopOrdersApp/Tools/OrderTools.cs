using System.ComponentModel;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Diagrid.AI.Microsoft.AgentFramework.Abstractions;
using Microsoft.Extensions.AI;
using ShopOrdersApp.Models;

namespace ShopOrdersApp.Tools;

internal static class OrderTools
{
    public static AIFunction GetOrderStatus { get; } = AIFunctionFactory.Create(GetOrderStatusImpl, name: "GetOrderStatus");

    public static AIFunction PlaceOrder { get; } = AIFunctionFactory.Create(
        async ([Description("Product SKU, e.g. 'CBL-USBC-1M'.")] string sku,
               [Description("Quantity, 1-10.")] int quantity,
               IServiceProvider services) =>
        {
            var runId = services.GetRequiredService<IDaprAgentContextAccessor>().Current?.CurrentWorkflowInstanceId ?? "";
            var idempotencyKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{runId}|{sku}|{quantity}")));

            var http = services.GetRequiredService<IHttpClientFactory>().CreateClient("orders");
            var response = await http.PostAsJsonAsync("/orders", new { sku, quantity, idempotencyKey });
            return response.IsSuccessStatusCode
                ? new ToolResult(true, null)
                : new ToolResult(false, $"Order service returned {(int)response.StatusCode}.");
        },
        name: "PlaceOrder",
        description: "Place an order for a product. Returns success or an error the agent can explain to the user.");

    public static AIFunction CancelOrder { get; } = AIFunctionFactory.Create(CancelOrderImpl, name: "CancelOrder");

    [Description("Return the fulfilment status of an order.")]
    private static async Task<OrderStatus> GetOrderStatusImpl(
        [Description("Order id, e.g. 'ORD-2026-0042'.")] string orderId,
        IServiceProvider services)
    {
        var http = services.GetRequiredService<IHttpClientFactory>().CreateClient("orders");
        var status = await http.GetFromJsonAsync<OrderStatus>($"/orders/{Uri.EscapeDataString(orderId)}/status");
        return status ?? new OrderStatus(orderId, "unknown");
    }

    [Description("Cancel an order that has not shipped yet.")]
    private static async Task<ToolResult> CancelOrderImpl(
        [Description("Order id to cancel.")] string orderId,
        IServiceProvider services)
    {
        var http = services.GetRequiredService<IHttpClientFactory>().CreateClient("orders");
        var response = await http.PostAsync($"/orders/{Uri.EscapeDataString(orderId)}/cancel", content: null);
        return response.IsSuccessStatusCode
            ? new ToolResult(true, null)
            : new ToolResult(false, $"Order service returned {(int)response.StatusCode}.");
    }
}
