using Dapr.Workflow;
using SubscriptionBilling.Models;

namespace SubscriptionBilling.Activities;

public class StartDunningActivity(DaprWorkflowClient workflowClient)
    : WorkflowActivity<DunningRequest, DunningResult>
{
    public override async Task<DunningResult> RunAsync(WorkflowActivityContext context, DunningRequest input)
    {
        var instanceId = await workflowClient.ScheduleNewWorkflowAsync(
            name: "DunningWorkflow",
            instanceId: $"dunning-{input.SubscriptionId}",
            input: input);

        return new DunningResult(instanceId);
    }
}
