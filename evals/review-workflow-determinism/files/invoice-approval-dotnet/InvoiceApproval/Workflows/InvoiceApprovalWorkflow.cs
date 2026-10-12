using Microsoft.Extensions.Logging;
using Dapr.Workflow;
using InvoiceApproval.Activities;
using InvoiceApproval.Models;

namespace InvoiceApproval.Workflows;

internal sealed partial class InvoiceApprovalWorkflow : Workflow<InvoiceInput, InvoiceOutput>
{
    public const string ApprovalEventName = "invoice-approval";

    public override async Task<InvoiceOutput> RunAsync(WorkflowContext context, InvoiceInput input)
    {
        var logger = context.CreateReplaySafeLogger<InvoiceApprovalWorkflow>();
        LogStart(logger, input.Id, input.Lines.Count);

        var requestedAt = context.CurrentUtcDateTime;
        var requestId = context.NewGuid().ToString("N");

        // Bounded loop over an ordered input list: deterministic.
        var checks = new List<Task<LineCheckResult>>();
        for (var i = 0; i < input.Lines.Count; i++)
        {
            checks.Add(context.CallActivityAsync<LineCheckResult>(
                nameof(ValidateInvoiceLineActivity),
                new LineCheck(input.Id, i + 1, input.Lines[i])));
        }

        var results = await Task.WhenAll(checks);
        if (results.Any(r => !r.IsValid))
        {
            return new InvoiceOutput(input.Id, "Rejected: invalid lines", context.CurrentUtcDateTime);
        }

        var total = input.Lines.Sum(l => l.Amount);
        await context.CallActivityAsync(
            nameof(RequestApprovalActivity),
            new ApprovalRequest(input.Id, requestId, total, requestedAt));

        ApprovalDecision decision;
        try
        {
            decision = await context.WaitForExternalEventAsync<ApprovalDecision>(
                eventName: ApprovalEventName,
                timeout: TimeSpan.FromDays(2));
        }
        catch (TaskCanceledException)
        {
            if (!context.IsReplaying)
            {
                LogTimedOut(logger, input.Id);
            }

            return new InvoiceOutput(input.Id, "Expired", context.CurrentUtcDateTime);
        }

        if (!decision.IsApproved)
        {
            return new InvoiceOutput(input.Id, $"Rejected by {decision.ApprovedBy}", context.CurrentUtcDateTime);
        }

        // Short, durable pause before releasing the payment run.
        await context.CreateTimer(TimeSpan.FromMinutes(5));

        var payment = await context.CallActivityAsync<PaymentConfirmation>(
            nameof(SchedulePaymentActivity),
            new PaymentInstruction(input.Id, $"{context.InstanceId}-payment", total));

        LogPaid(logger, input.Id, payment.PaymentId);
        return new InvoiceOutput(input.Id, "Paid", context.CurrentUtcDateTime);
    }

    [LoggerMessage(LogLevel.Information, "Starting approval for invoice {InvoiceId} with {LineCount} lines")]
    static partial void LogStart(ILogger logger, string InvoiceId, int LineCount);

    [LoggerMessage(LogLevel.Warning, "Approval for invoice {InvoiceId} timed out")]
    static partial void LogTimedOut(ILogger logger, string InvoiceId);

    [LoggerMessage(LogLevel.Information, "Invoice {InvoiceId} paid with {PaymentId}")]
    static partial void LogPaid(ILogger logger, string InvoiceId, string PaymentId);
}
