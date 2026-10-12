using Dapr.Workflow;
using Diagrid.AI.Microsoft.AgentFramework.Abstractions;
using Diagrid.AI.Microsoft.AgentFramework.Hosting;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using FaqBotApp.Models;
using FaqBotApp.Tools;

var builder = WebApplication.CreateBuilder(args);

var tools = new List<AITool> { FaqTools.LookupFaq };

builder.Services.AddDaprAgents()
    .WithAgent(
        agentName: "faq-bot",
        conversationComponentName: "llm-provider",
        instructions: "Answer HR questions from employees. Use the LookupFaq tool and say so when no entry matches.",
        tools: tools,
        serviceLifetime: ServiceLifetime.Singleton);

var app = builder.Build();

app.MapPost("/run", async (
    AgentRunRequest request,
    IDaprAgentInvoker invoker,
    DaprWorkflowClient workflowClient,
    CancellationToken ct) =>
{
    AgentSession session;
    if (request.SessionId is null)
    {
        session = await invoker.CreateSessionAsync(workflowClient, maxTurns: 20, cancellationToken: ct);
    }
    else
    {
        var sessionState = await workflowClient.GetWorkflowStateAsync(request.SessionId, cancellation: ct);
        if (!sessionState.Exists)
        {
            return Results.NotFound(new { error = $"Session '{request.SessionId}' not found." });
        }
        if (!sessionState.IsWorkflowRunning)
        {
            return Results.Conflict(new { error = "The session has ended; start a new one by omitting sessionId." });
        }
        session = invoker.AttachSession(request.SessionId);
    }

    var agent = invoker.GetAgent("faq-bot");
    var response = await invoker.RunAgentAsync(agent, request.Prompt, session, cancellationToken: ct);

    return Results.Ok(new AgentRunReply(response.Text, session.GetSessionInstanceId()));
});

app.Run();
