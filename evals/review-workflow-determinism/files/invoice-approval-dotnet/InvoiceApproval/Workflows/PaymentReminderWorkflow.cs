using Dapr.Workflow;
using InvoiceApproval.Activities;
using InvoiceApproval.Models;

namespace InvoiceApproval.Workflows;

internal sealed class PaymentReminderWorkflow : Workflow<ReminderState, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, ReminderState state)
    {
        var status = await context.CallActivityAsync<ReminderStatus>(
            nameof(CheckInvoiceSettledActivity),
            state.InvoiceId);

        if (status.IsSettled)
        {
            return $"Invoice {state.InvoiceId} settled after {state.RemindersSent} reminders.";
        }

        await context.CreateTimer(TimeSpan.FromDays(1));

        // One reminder per execution; ContinueAsNew is the last workflow action.
        context.ContinueAsNew(state with { RemindersSent = state.RemindersSent + 1 });
        return $"Reminder {state.RemindersSent + 1} scheduled for invoice {state.InvoiceId}.";
    }
}
