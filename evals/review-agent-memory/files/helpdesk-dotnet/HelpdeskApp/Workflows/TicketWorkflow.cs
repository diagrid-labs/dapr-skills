using Dapr.Workflow;
using Diagrid.AI.Microsoft.AgentFramework.Runtime;
using HelpdeskApp.Models;

namespace HelpdeskApp.Workflows;

internal sealed class TicketWorkflow : Workflow<TicketRequest, TicketTriage>
{
    private const string IterationCapMarker = "exceeded the maximum of";

    public override async Task<TicketTriage> RunAsync(WorkflowContext context, TicketRequest input)
    {
        var category = await context.RunAgentAsync(
            context.GetAgent(AgentNames.Classifier),
            $"Ticket from {input.Reporter}: {input.Description}");

        var draft = await context.RunAgentAsync(
            context.GetAgent(AgentNames.Responder),
            $"Category: {category.Text}\nTicket: {input.Description}");

        if (draft.Text.Contains(IterationCapMarker, StringComparison.Ordinal))
        {
            return new TicketTriage(category.Text.Trim(), null);
        }

        return new TicketTriage(category.Text.Trim(), draft.Text);
    }
}
