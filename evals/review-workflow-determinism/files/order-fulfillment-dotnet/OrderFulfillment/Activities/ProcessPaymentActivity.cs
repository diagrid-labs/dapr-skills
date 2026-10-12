using System.Net.Http.Json;
using Dapr.Workflow;
using OrderFulfillment.Models;

namespace OrderFulfillment.Activities;

internal sealed class ProcessPaymentActivity(IHttpClientFactory httpClientFactory)
    : WorkflowActivity<PaymentRequest, PaymentResult>
{
    public override async Task<PaymentResult> RunAsync(WorkflowActivityContext context, PaymentRequest input)
    {
        var client = httpClientFactory.CreateClient("payments");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v1/charges")
        {
            Content = JsonContent.Create(new { input.CustomerId, input.Amount })
        };
        request.Headers.Add("Idempotency-Key", $"order-{input.OrderId}-payment");

        using var response = await client.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var transactionId = await response.Content.ReadAsStringAsync();
        return new PaymentResult(transactionId);
    }
}
