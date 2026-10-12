using Microsoft.AspNetCore.Mvc;
using Dapr.Workflow;
using Dapr.Workflow.Versioning;
using ExpenseApproval.Models;
using ExpenseApproval.Workflows;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprWorkflow();
builder.Services.AddDaprWorkflowVersioning();

var app = builder.Build();

app.MapPost("/start", async (
    [FromServices] DaprWorkflowClient workflowClient,
    [FromBody] ExpenseClaim claim) =>
{
    await workflowClient.ScheduleNewWorkflowAsync(
        name: nameof(ExpenseApprovalWorkflow),
        instanceId: "expense-approval",
        input: claim);

    return Results.Accepted();
});

app.MapGet("/status/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    var state = await workflowClient.GetWorkflowStateAsync(instanceId);
    if (state is null)
    {
        return Results.NotFound();
    }

    var output = state.ReadOutputAs<ExpenseOutcome>();
    return Results.Ok(new { state, output });
});

app.MapGet("/result/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    var state = await workflowClient.WaitForWorkflowCompletionAsync(instanceId);
    return Results.Ok(state.ReadOutputAs<ExpenseOutcome>());
});

app.MapPost("/pause/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.SuspendWorkflowAsync(instanceId);
    return Results.Accepted();
});

app.MapPost("/terminate/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.TerminateWorkflowAsync(instanceId);
    return Results.Accepted();
});

app.MapDelete("/purge/{instanceId}", async (
    [FromRoute] string instanceId,
    [FromServices] DaprWorkflowClient workflowClient) =>
{
    await workflowClient.PurgeInstanceAsync(instanceId);
    return Results.Ok(new { purged = instanceId });
});

app.Run();
