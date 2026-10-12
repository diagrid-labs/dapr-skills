using System.Net.Http.Json;
using Dapr.Workflow;
using SubscriptionBilling.Models;

namespace SubscriptionBilling.Activities;

internal sealed partial class ChargeSubscriptionActivity(
    IHttpClientFactory httpClientFactory,
    ILogger<ChargeSubscriptionActivity> logger) : WorkflowActivity<ChargeRequest, ChargeResult>
{
    public override async Task<ChargeResult> RunAsync(WorkflowActivityContext context, ChargeRequest input)
    {
        var client = httpClientFactory.CreateClient("payments");
        LogCharging(logger, input.SubscriptionId, input.Amount);

        var response = await client.PostAsJsonAsync("/v1/charges", new
        {
            customer = input.CustomerId,
            amount = input.Amount,
            description = $"Subscription {input.SubscriptionId}"
        });

        if (!response.IsSuccessStatusCode)
        {
            LogChargeFailed(logger, input.SubscriptionId, (int)response.StatusCode);
            throw new HttpRequestException($"Charge failed with {(int)response.StatusCode}");
        }

        var chargeId = await response.Content.ReadAsStringAsync();
        return new ChargeResult(true, chargeId);
    }

    [LoggerMessage(LogLevel.Information, "Charging subscription {SubscriptionId} for {Amount}")]
    static partial void LogCharging(ILogger logger, string SubscriptionId, decimal Amount);

    [LoggerMessage(LogLevel.Error, "Charge for subscription {SubscriptionId} failed with status {StatusCode}")]
    static partial void LogChargeFailed(ILogger logger, string SubscriptionId, int StatusCode);
}
