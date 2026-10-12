using System.Net.Http.Json;
using Dapr.Workflow;
using InvoiceApproval.Models;

namespace InvoiceApproval.Activities;

internal sealed class ValidateInvoiceLineActivity : WorkflowActivity<LineCheck, LineCheckResult>
{
    public override Task<LineCheckResult> RunAsync(WorkflowActivityContext context, LineCheck input) =>
        Task.FromResult(new LineCheckResult(input.LineNumber, input.Line.Amount > 0));
}

internal sealed partial class RequestApprovalActivity(ILogger<RequestApprovalActivity> logger)
    : WorkflowActivity<ApprovalRequest, bool>
{
    public override Task<bool> RunAsync(WorkflowActivityContext context, ApprovalRequest input)
    {
        LogRequested(logger, input.InvoiceId, input.Total);
        return Task.FromResult(true);
    }

    [LoggerMessage(LogLevel.Information, "Approval requested for invoice {InvoiceId} ({Total})")]
    static partial void LogRequested(ILogger logger, string InvoiceId, decimal Total);
}

internal sealed class SchedulePaymentActivity(HttpClient httpClient)
    : WorkflowActivity<PaymentInstruction, PaymentConfirmation>
{
    public override async Task<PaymentConfirmation> RunAsync(WorkflowActivityContext context, PaymentInstruction input)
    {
        // I/O, wall-clock time and fresh GUIDs are all fine inside an activity.
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://ap.example.com/payments")
        {
            Content = JsonContent.Create(input)
        };
        request.Headers.Add("Idempotency-Key", input.PaymentReference);
        using var response = await httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();

        return new PaymentConfirmation(Guid.NewGuid().ToString("N"), DateTime.UtcNow);
    }
}

internal sealed class CheckInvoiceSettledActivity : WorkflowActivity<string, ReminderStatus>
{
    public override Task<ReminderStatus> RunAsync(WorkflowActivityContext context, string invoiceId)
    {
        // TODO: query the accounts-payable ledger
        return Task.FromResult(new ReminderStatus(DateTime.UtcNow.DayOfWeek == DayOfWeek.Friday));
    }
}
