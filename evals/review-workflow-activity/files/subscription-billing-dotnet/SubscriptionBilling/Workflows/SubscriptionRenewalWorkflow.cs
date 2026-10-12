using Microsoft.Extensions.Logging;
using Dapr.Workflow;
using SubscriptionBilling.Activities;
using SubscriptionBilling.Models;

namespace SubscriptionBilling.Workflows;

internal sealed partial class SubscriptionRenewalWorkflow : Workflow<BillingInput, BillingOutput>
{
    private static readonly WorkflowTaskOptions RetryOptions = new(
        new WorkflowRetryPolicy(maxNumberOfAttempts: 3, firstRetryInterval: TimeSpan.FromSeconds(10)));

    public override async Task<BillingOutput> RunAsync(WorkflowContext context, BillingInput input)
    {
        var logger = context.CreateReplaySafeLogger<SubscriptionRenewalWorkflow>();

        var charge = await context.CallActivityAsync<ChargeResult>(
            nameof(ChargeSubscriptionActivity),
            new ChargeRequest(input.SubscriptionId, input.CustomerId, input.Amount));

        if (!charge.Succeeded || charge.ChargeId is null)
        {
            await context.CallActivityAsync<DunningResult>(
                nameof(StartDunningActivity),
                new DunningRequest(input.SubscriptionId, input.CustomerId));
            return new BillingOutput(input.SubscriptionId, false, null);
        }

        await context.CallActivityAsync<LedgerResult>(
            nameof(RecordLedgerEntryActivity),
            new LedgerEntry(input.SubscriptionId, charge.ChargeId, input.Amount),
            RetryOptions);

        await context.CallActivityAsync<EmailResult>(
            nameof(SendInvoiceEmailActivity),
            new InvoiceEmail($"{context.InstanceId}-invoice", input.Email, input.Amount));

        LogRenewed(logger, input.SubscriptionId, charge.ChargeId);
        return new BillingOutput(input.SubscriptionId, true, charge.ChargeId);
    }

    [LoggerMessage(LogLevel.Information, "Subscription {SubscriptionId} renewed with charge {ChargeId}")]
    static partial void LogRenewed(ILogger logger, string SubscriptionId, string ChargeId);
}
