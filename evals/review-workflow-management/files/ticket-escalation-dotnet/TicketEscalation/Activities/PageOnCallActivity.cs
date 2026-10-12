using Dapr.Workflow;
using TicketEscalation.Models;

namespace TicketEscalation.Activities;

internal sealed partial class PageOnCallActivity(ILogger<PageOnCallActivity> logger)
    : WorkflowActivity<PageRequest, bool>
{
    public override Task<bool> RunAsync(WorkflowActivityContext context, PageRequest input)
    {
        // TODO: call the paging provider, keyed on input.TicketId
        LogPaged(logger, input.TicketId, input.Priority);
        return Task.FromResult(true);
    }

    [LoggerMessage(LogLevel.Information, "Paged on-call for ticket {TicketId} ({Priority})")]
    static partial void LogPaged(ILogger logger, string TicketId, string Priority);
}
