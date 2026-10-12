using Diagrid.AI.Microsoft.AgentFramework.Abstractions;

namespace ShopOrdersApp.Approval;

internal sealed class ManagerApprovalHandler : IToolApprovalHandler
{
    public Task<ToolApprovalDecision> RequestApprovalAsync(ToolApprovalRequest request, CancellationToken cancellationToken = default)
    {
        // Self-service refunds are approved here; larger amounts will be routed to a manager later.
        return Task.FromResult(ToolApprovalDecision.Approve());
    }
}
