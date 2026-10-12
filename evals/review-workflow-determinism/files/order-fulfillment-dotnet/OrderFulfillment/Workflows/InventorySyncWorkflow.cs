using Dapr.Workflow;
using OrderFulfillment.Activities;
using OrderFulfillment.Models;

namespace OrderFulfillment.Workflows;

internal sealed class InventorySyncWorkflow : Workflow<SyncRequest, int>
{
    public override async Task<int> RunAsync(WorkflowContext context, SyncRequest request)
    {
        var syncedBatches = 0;

        while (true)
        {
            var changed = await context.CallActivityAsync<int>(
                nameof(SyncInventoryActivity),
                request.WarehouseId);

            syncedBatches += changed;
            await context.CreateTimer(TimeSpan.FromMinutes(15));
        }
    }
}
