using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Dapr.Workflow;
using Dapr.Workflow.Versioning;
using TicketEscalation.Models;
using TicketEscalation.Workflows;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprWorkflow();
builder.Services.AddDaprWorkflowVersioning();
builder.Services.AddAuthentication().AddJwtBearer();
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

app.MapPost("/start", async (
    [FromServices] DaprWorkflowClient workflowClient,
    [FromBody] TicketInput input) =>
{
    if (string.IsNullOrWhiteSpace(input.Id) || string.IsNullOrWhiteSpace(input.CustomerId))
    {
        return Results.BadRequest("Both 'id' and 'customerId' are required.");
    }

    var instanceId = await workflowClient.ScheduleNewWorkflowAsync(
        name: nameof(TicketEscalationWorkflow),
        instanceId: input.Id,
        input: input);

    return Results.Ok(new { instanceId });
})
.WithName("StartTicketEscalation")
.Produces(StatusCodes.Status200OK)
.Produces(StatusCodes.Status400BadRequest)
.RequireAuthorization();

app.MapGet("/status/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId);
    if (!state.Exists)
    {
        return Results.NotFound($"Workflow instance '{instanceId}' not found.");
    }

    var output = state.ReadOutputAs<TicketOutput>();
    return Results.Ok(new { state, output });
})
.WithName("GetTicketEscalationStatus")
.Produces(StatusCodes.Status200OK)
.Produces(StatusCodes.Status404NotFound)
.RequireAuthorization();

app.MapPost("/pause/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.SuspendWorkflowAsync(instanceId);
    return Results.Accepted();
})
.WithName("PauseTicketEscalation")
.Produces(StatusCodes.Status202Accepted)
.RequireAuthorization();

app.MapPost("/resume/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.ResumeWorkflowAsync(instanceId);
    return Results.Accepted();
})
.WithName("ResumeTicketEscalation")
.Produces(StatusCodes.Status202Accepted)
.RequireAuthorization();

app.MapPost("/terminate/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.TerminateWorkflowAsync(instanceId);
    return Results.Accepted();
})
.WithName("TerminateTicketEscalation")
.Produces(StatusCodes.Status202Accepted)
.RequireAuthorization();

app.MapPost("/raise-event/{instanceId}/{eventName}", async (
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
})
.WithName("RaiseTicketEscalationEvent")
.Produces(StatusCodes.Status202Accepted)
.Produces(StatusCodes.Status404NotFound)
.RequireAuthorization();

app.MapDelete("/purge/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId, getInputsAndOutputs: false);
    if (!state.Exists)
    {
        return Results.NotFound($"Workflow instance '{instanceId}' not found.");
    }
    if (!state.IsWorkflowCompleted)
    {
        return Results.Conflict(
            $"Workflow instance '{instanceId}' is not in a terminal state; terminate it before purging.");
    }

    var purged = await workflowClient.PurgeInstanceAsync(instanceId);
    if (!purged)
    {
        return Results.NotFound($"Workflow instance '{instanceId}' was not purged.");
    }

    return Results.NoContent();
})
.WithName("PurgeTicketEscalation")
.Produces(StatusCodes.Status204NoContent)
.Produces(StatusCodes.Status404NotFound)
.Produces(StatusCodes.Status409Conflict)
.RequireAuthorization();

app.Run();
