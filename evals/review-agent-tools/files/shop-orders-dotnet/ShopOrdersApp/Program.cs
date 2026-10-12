using Dapr.Workflow;
using Diagrid.AI.Microsoft.AgentFramework.Abstractions;
using Diagrid.AI.Microsoft.AgentFramework.Hosting;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using ShopOrdersApp.Approval;
using ShopOrdersApp.Models;
using ShopOrdersApp.Tools;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient("orders", client => client.BaseAddress = new Uri("https://orders.internal.example.com"));

var tools = new List<AITool>
{
    OrderTools.GetOrderStatus,
    OrderTools.PlaceOrder,
    OrderTools.CancelOrder,
    CatalogTools.SearchCatalog,
    CatalogTools.LookupStock,
    CatalogTools.ListPromotions,
    new ApprovalRequiredAIFunction(RefundTools.IssueRefund),
};

builder.Services.AddDaprAgents()
    .WithAgent(
        agentName: "shop-orders",
        conversationComponentName: "llm-provider",
        instructions: "You help shop staff with orders. Use GetOrderStatus, PlaceOrder and CancelOrder for orders, " +
                      "SearchCatalog, LookupStock and ListPromotions for products, and IssueRefund for refunds.",
        tools: tools,
        serviceLifetime: ServiceLifetime.Singleton);

builder.Services.AddSingleton<IToolApprovalHandler, ManagerApprovalHandler>();

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
        session = await invoker.CreateSessionAsync(workflowClient, cancellationToken: ct);
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

    var agent = invoker.GetAgent("shop-orders");
    var response = await invoker.RunAgentAsync(agent, request.Prompt, session, cancellationToken: ct);

    return Results.Ok(new AgentRunReply(response.Text, session.GetSessionInstanceId()));
});

app.Run();
