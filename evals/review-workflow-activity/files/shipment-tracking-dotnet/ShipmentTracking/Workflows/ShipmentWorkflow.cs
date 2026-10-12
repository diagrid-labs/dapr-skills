using Dapr.Workflow;
using ShipmentTracking.Activities;
using ShipmentTracking.Models;

namespace ShipmentTracking.Workflows;

internal sealed class ShipmentWorkflow : Workflow<ShipmentInput, ShipmentOutput>
{
    public override async Task<ShipmentOutput> RunAsync(WorkflowContext context, ShipmentInput input)
    {
        var retry = new WorkflowTaskOptions(
            new WorkflowRetryPolicy(maxNumberOfAttempts: 5, firstRetryInterval: TimeSpan.FromSeconds(5)));

        // Stable business keys generated deterministically in the workflow, reused across retry attempts.
        var label = await context.CallActivityAsync<LabelResult>(
            nameof(CreateShippingLabelActivity),
            new LabelRequest(input.OrderId, input.Carrier, $"{context.InstanceId}-label"),
            retry);

        await context.CallActivityAsync<NotificationResult>(
            nameof(SendTrackingEmailActivity),
            new TrackingNotification(input.OrderId, input.CustomerEmail, label.TrackingNumber, context.NewGuid().ToString("N")),
            retry);

        return new ShipmentOutput(input.OrderId, label.TrackingNumber, label.LabelId);
    }
}
