using System.Net.Http.Json;
using Dapr.Workflow;
using SubscriptionBilling.Models;

namespace SubscriptionBilling.Activities;

internal sealed partial class RecordLedgerEntryActivity(
    IHttpClientFactory httpClientFactory,
    ILogger<RecordLedgerEntryActivity> logger) : WorkflowActivity<LedgerEntry, LedgerResult>
{
    public override async Task<LedgerResult> RunAsync(WorkflowActivityContext context, LedgerEntry input)
    {
        var client = httpClientFactory.CreateClient("ledger");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/entries")
        {
            Content = JsonContent.Create(input)
        };
        request.Headers.Add("Idempotency-Key", context.TaskExecutionKey);

        try
        {
            using var response = await client.SendAsync(request);
            response.EnsureSuccessStatusCode();
            var entryId = await response.Content.ReadAsStringAsync();
            return new LedgerResult(entryId, DateTime.UtcNow);
        }
        catch (HttpRequestException ex)
        {
            LogLedgerFailed(logger, input.SubscriptionId, ex.Message);
            throw;
        }
    }

    [LoggerMessage(LogLevel.Error, "Ledger write for subscription {SubscriptionId} failed: {Reason}")]
    static partial void LogLedgerFailed(ILogger logger, string SubscriptionId, string Reason);
}
