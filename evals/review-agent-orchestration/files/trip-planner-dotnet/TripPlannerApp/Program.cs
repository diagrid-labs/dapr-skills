using Dapr.Workflow;
using Diagrid.AI.Microsoft.AgentFramework.Hosting;
using Microsoft.Extensions.AI;
using TripPlannerApp.Models;
using TripPlannerApp.Tools;
using TripPlannerApp.Workflows;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDaprAgents(registrations: options => options.RegisterWorkflow<TripWorkflow>())
    .WithAgent(
        agentName: AgentNames.Flights,
        conversationComponentName: "llm-provider",
        instructions: "You find flights. Use the SearchFlights tool and return the two best options with price.",
        tools: new List<AITool> { TravelTools.SearchFlights },
        serviceLifetime: ServiceLifetime.Singleton)
    .WithAgent(
        agentName: AgentNames.Hotels,
        conversationComponentName: "llm-provider",
        instructions: "You find hotels. Use the SearchHotels tool and return the two best options with price per night.",
        tools: new List<AITool> { TravelTools.SearchHotels },
        serviceLifetime: ServiceLifetime.Singleton)
    .WithAgent(
        agentName: AgentNames.Coordinator,
        conversationComponentName: "llm-provider",
        instructions: "You combine flight and hotel options into one short travel proposal.",
        serviceLifetime: ServiceLifetime.Singleton);

var app = builder.Build();

app.MapPost("/run", async (TripRequest request, DaprWorkflowClient workflowClient) =>
{
    var instanceId = await workflowClient.ScheduleNewWorkflowAsync(nameof(TripWorkflow), input: request);
    return Results.Accepted($"/status/{instanceId}", new { instanceId });
});

app.MapGet("/status/{instanceId}", async (string instanceId, DaprWorkflowClient workflowClient, CancellationToken ct) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId, cancellation: ct);
    if (!state.Exists)
    {
        return Results.NotFound();
    }

    return Results.Ok(new
    {
        status = state.RuntimeStatus.ToString(),
        result = state.RuntimeStatus == WorkflowRuntimeStatus.Completed ? state.ReadOutputAs<TripProposal>() : null
    });
});

app.Run();
