using Dapr.Workflow;
using OrderFulfillment.Models;

namespace OrderFulfillment.Activities;

internal sealed class ShipOrderActivity : WorkflowActivity<ShipmentRequest, ShipmentResult>
{
    public override Task<ShipmentResult> RunAsync(WorkflowActivityContext context, ShipmentRequest input)
    {
        // TODO: call the carrier API
        var trackingNumber = $"TRK-{input.ShipmentReference[..8].ToUpperInvariant()}";
        return Task.FromResult(new ShipmentResult(trackingNumber));
    }
}
