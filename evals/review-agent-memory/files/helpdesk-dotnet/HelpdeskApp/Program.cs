using Dapr.Workflow;
using Diagrid.AI.Microsoft.AgentFramework.Abstractions;
using Diagrid.AI.Microsoft.AgentFramework.Hosting;
using Microsoft.Extensions.AI;
using HelpdeskApp.Models;
using HelpdeskApp.Tools;
using HelpdeskApp.Workflows;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDaprAgents(registrations: options => options.RegisterWorkflow<TicketWorkflow>())
    .WithAgent(
        agentName: AgentNames.Classifier,
        conversationComponentName: "llm-provider",
        instructions: "Classify a helpdesk ticket as 'hardware', 'software' or 'access'. Reply with the category only.",
        serviceLifetime: ServiceLifetime.Singleton)
    .WithAgent(
        agentName: AgentNames.Responder,
        conversationComponentName: "llm-provider",
        instructions: "Draft a short, friendly first response to a helpdesk ticket. Use the SearchKnowledgeBase tool.",
        tools: new List<AITool> { KnowledgeBaseTools.SearchKnowledgeBase },
        serviceLifetime: ServiceLifetime.Singleton);

var app = builder.Build();

// Chat with the responder agent about a ticket.
app.MapPost("/ask", async (AskRequest request, IDaprAgentInvoker invoker, CancellationToken ct) =>
{
    var agent = invoker.GetAgent(AgentNames.Responder);
    var response = await invoker.RunAgentAsync(agent, request.Question, cancellationToken: ct);
    return Results.Ok(new AskReply(response.Text));
});

// Triage a new ticket: classify it, then draft a first response.
app.MapPost("/tickets", async (TicketRequest request, DaprWorkflowClient workflowClient) =>
{
    var instanceId = await workflowClient.ScheduleNewWorkflowAsync(nameof(TicketWorkflow), input: request);
    return Results.Accepted($"/tickets/{instanceId}", new { instanceId });
});

app.MapGet("/tickets/{instanceId}", async (string instanceId, DaprWorkflowClient workflowClient, CancellationToken ct) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId, cancellation: ct);
    if (!state.Exists)
    {
        return Results.NotFound();
    }

    return Results.Ok(new
    {
        status = state.RuntimeStatus.ToString(),
        result = state.RuntimeStatus == WorkflowRuntimeStatus.Completed ? state.ReadOutputAs<TicketTriage>() : null
    });
});

app.Run();
