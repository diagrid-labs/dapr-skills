using Dapr.Workflow;

namespace OrderFulfillment.Activities;

internal sealed class SyncInventoryActivity : WorkflowActivity<string, int>
{
    public override async Task<int> RunAsync(WorkflowActivityContext context, string warehouseId)
    {
        // TODO: pull stock deltas from the warehouse management system
        await Task.Delay(TimeSpan.FromMilliseconds(250));
        return Random.Shared.Next(0, 50);
    }
}
