using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Dapr.Workflow;
using Dapr.Workflow.Versioning;
using InvoiceApproval.Models;
using InvoiceApproval.Workflows;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprWorkflow();
builder.Services.AddDaprWorkflowVersioning();
builder.Services.AddHttpClient();

var app = builder.Build();

app.MapPost("/start", async (
    [FromServices] DaprWorkflowClient workflowClient,
    [FromBody] InvoiceInput input) =>
{
    var instanceId = await workflowClient.ScheduleNewWorkflowAsync(
        name: nameof(InvoiceApprovalWorkflow),
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

    var output = state.ReadOutputAs<InvoiceOutput>();
    return Results.Ok(new { state, output });
});

app.MapPost("raise-event/{instanceId}/{eventName}", async (
    [FromRoute] string instanceId,
    [FromRoute] string eventName,
    [FromBody] JsonElement eventPayload,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId);
    if (!state.Exists)
    {
        return Results.NotFound($"Workflow instance '{instanceId}' not found.");
    }

    await workflowClient.RaiseEventAsync(instanceId, eventName, eventPayload);
    return Results.Accepted();
});

app.Run();
