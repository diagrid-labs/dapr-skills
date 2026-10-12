using Dapr.Workflow;
using ExpenseApproval.Activities;
using ExpenseApproval.Models;

namespace ExpenseApproval.Workflows;

internal sealed class ExpenseApprovalWorkflow : Workflow<ExpenseClaim, ExpenseOutcome>
{
    public const string ManagerDecisionEvent = "manager-decision";

    public override async Task<ExpenseOutcome> RunAsync(WorkflowContext context, ExpenseClaim claim)
    {
        if (claim.Amount <= 100)
        {
            await context.CallActivityAsync<bool>(
                nameof(ReimburseActivity),
                new ReimbursementRequest(claim.Id, claim.EmployeeId, claim.Amount));
            return new ExpenseOutcome(claim.Id, "AutoApproved");
        }

        ManagerDecision decision;
        try
        {
            decision = await context.WaitForExternalEventAsync<ManagerDecision>(
                eventName: ManagerDecisionEvent,
                timeout: TimeSpan.FromDays(3));
        }
        catch (TaskCanceledException)
        {
            return new ExpenseOutcome(claim.Id, "Expired");
        }

        if (!decision.IsApproved)
        {
            return new ExpenseOutcome(claim.Id, $"Rejected by {decision.ManagerId}");
        }

        await context.CallActivityAsync<bool>(
            nameof(ReimburseActivity),
            new ReimbursementRequest(claim.Id, claim.EmployeeId, claim.Amount));
        return new ExpenseOutcome(claim.Id, $"Approved by {decision.ManagerId}");
    }
}
