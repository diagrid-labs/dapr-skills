using Microsoft.AspNetCore.Mvc;
using Dapr.Workflow;
using Dapr.Workflow.Versioning;
using OrderFulfillment.Models;
using OrderFulfillment.Workflows;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprWorkflow();
builder.Services.AddDaprWorkflowVersioning();
builder.Services.AddHttpClient("payments", c => c.BaseAddress = new Uri("https://payments.internal.example.com"));

var app = builder.Build();

app.MapPost("/start", async (
    [FromServices] DaprWorkflowClient workflowClient,
    [FromBody] OrderRequest order) =>
{
    // Generating the instance id here is fine: this is not workflow code.
    var instanceId = $"order-{order.OrderId}-{Guid.NewGuid():N}";
    await workflowClient.ScheduleNewWorkflowAsync(
        name: nameof(OrderFulfillmentWorkflow),
        instanceId: instanceId,
        input: order);

    return Results.Ok(new { instanceId, startedAt = DateTime.UtcNow });
});

app.MapPost("/inventory-sync/{warehouseId}", async (
    [FromRoute] string warehouseId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    var instanceId = await workflowClient.ScheduleNewWorkflowAsync(
        name: nameof(InventorySyncWorkflow),
        instanceId: $"inventory-sync-{warehouseId}",
        input: new SyncRequest(warehouseId));

    return Results.Ok(new { instanceId });
});

app.MapGet("/status/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId);
    if (!state.Exists)
    {
        return Results.NotFound($"Workflow instance '{instanceId}' not found.");
    }

    var output = state.ReadOutputAs<OrderResult>();
    return Results.Ok(new { state, output });
});

app.MapPost("terminate/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.TerminateWorkflowAsync(instanceId);
    return Results.Accepted();
});

app.Run();
