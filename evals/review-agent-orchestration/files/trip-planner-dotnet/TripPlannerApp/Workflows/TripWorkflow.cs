using Dapr.Workflow;
using Diagrid.AI.Microsoft.AgentFramework.Runtime;
using TripPlannerApp.Models;

namespace TripPlannerApp.Workflows;

internal sealed class TripWorkflow : Workflow<TripRequest, TripProposal>
{
    public override async Task<TripProposal> RunAsync(WorkflowContext context, TripRequest input)
    {
        var flightsTask = context.RunAgentAsync(
            context.GetAgent(AgentNames.Flights),
            $"Find flights from {input.Origin} to {input.Destination} on {input.DepartureDate}.");
        var hotelsTask = context.RunAgentAsync(
            context.GetAgent(AgentNames.Hotels),
            $"Find hotels in {input.Destination} for {input.Nights} nights from {input.DepartureDate}.");

        var results = await Task.WhenAll(flightsTask, hotelsTask);

        var proposal = await context.RunAgentAsync(
            context.GetAgent(AgentNames.Coordinator),
            $"""
             Combine these options into one proposal for a trip to {input.Destination}.

             Flights:
             {results[0].Text}

             Hotels:
             {results[1].Text}
             """);

        return new TripProposal(proposal.Text);
    }
}
