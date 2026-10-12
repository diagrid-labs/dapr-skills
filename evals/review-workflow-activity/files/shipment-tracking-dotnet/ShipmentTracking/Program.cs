using Microsoft.AspNetCore.Mvc;
using Dapr.Workflow;
using Dapr.Workflow.Versioning;
using ShipmentTracking.Models;
using ShipmentTracking.Workflows;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprWorkflow();
builder.Services.AddDaprWorkflowVersioning();
builder.Services.AddHttpClient("carrier", c => c.BaseAddress = new Uri("https://carrier-gateway.example.com"));
builder.Services.AddHttpClient("email", c => c.BaseAddress = new Uri("https://api.mail.example.com"));

var app = builder.Build();

app.MapPost("/start", async (
    [FromServices] DaprWorkflowClient workflowClient,
    [FromBody] ShipmentInput input) =>
{
    var instanceId = await workflowClient.ScheduleNewWorkflowAsync(
        name: nameof(ShipmentWorkflow),
        instanceId: input.Id,
        input: input);

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

    var output = state.ReadOutputAs<ShipmentOutput>();
    return Results.Ok(new { state, output });
});

app.Run();
