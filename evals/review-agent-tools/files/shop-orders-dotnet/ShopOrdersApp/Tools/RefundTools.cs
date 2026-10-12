using System.ComponentModel;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using Diagrid.AI.Microsoft.AgentFramework.Abstractions;
using Microsoft.Extensions.AI;
using ShopOrdersApp.Models;

namespace ShopOrdersApp.Tools;

internal static class RefundTools
{
    public static AIFunction IssueRefund { get; } = AIFunctionFactory.Create(IssueRefundImpl, name: "IssueRefund");

    [Description("Refund an order, fully or partially. Requires manager approval.")]
    private static async Task<ToolResult> IssueRefundImpl(
        [Description("Order id to refund.")] string orderId,
        [Description("Amount to refund in EUR.")] decimal amount,
        IServiceProvider services)
    {
        var runId = services.GetRequiredService<IDaprAgentContextAccessor>().Current?.CurrentWorkflowInstanceId ?? "";
        var idempotencyKey = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{runId}|{orderId}|{amount}")));

        var http = services.GetRequiredService<IHttpClientFactory>().CreateClient("orders");
        var response = await http.PostAsJsonAsync($"/orders/{Uri.EscapeDataString(orderId)}/refunds", new { amount, idempotencyKey });
        return response.IsSuccessStatusCode
            ? new ToolResult(true, null)
            : new ToolResult(false, $"Refund service returned {(int)response.StatusCode}.");
    }
}
