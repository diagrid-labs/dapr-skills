using Dapr.Workflow;
using ExpenseApproval.Models;

namespace ExpenseApproval.Activities;

internal sealed partial class ReimburseActivity(ILogger<ReimburseActivity> logger)
    : WorkflowActivity<ReimbursementRequest, bool>
{
    public override Task<bool> RunAsync(WorkflowActivityContext context, ReimbursementRequest input)
    {
        // TODO: call the payroll system, keyed on input.ClaimId
        LogReimbursed(logger, input.ClaimId, input.Amount);
        return Task.FromResult(true);
    }

    [LoggerMessage(LogLevel.Information, "Reimbursed claim {ClaimId} for {Amount}")]
    static partial void LogReimbursed(ILogger logger, string ClaimId, decimal Amount);
}
