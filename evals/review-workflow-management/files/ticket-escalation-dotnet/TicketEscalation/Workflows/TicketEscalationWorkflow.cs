using Dapr.Workflow;
using TicketEscalation.Activities;
using TicketEscalation.Models;

namespace TicketEscalation.Workflows;

internal sealed class TicketEscalationWorkflow : Workflow<TicketInput, TicketOutput>
{
    public const string EngineerAckEvent = "engineer-ack";

    public override async Task<TicketOutput> RunAsync(WorkflowContext context, TicketInput input)
    {
        await context.CallActivityAsync<bool>(
            nameof(PageOnCallActivity),
            new PageRequest(input.Id, input.Priority));

        try
        {
            var ack = await context.WaitForExternalEventAsync<EngineerAck>(
                eventName: EngineerAckEvent,
                timeout: TimeSpan.FromMinutes(30));
            return new TicketOutput(input.Id, $"Acknowledged by {ack.EngineerId}");
        }
        catch (TaskCanceledException)
        {
            return new TicketOutput(input.Id, "Escalated to duty manager");
        }
    }
}
