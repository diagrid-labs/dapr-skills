using Dapr.Workflow;
using OrderFulfillment.Models;

namespace OrderFulfillment.Activities;

internal sealed partial class ReserveInventoryActivity(ILogger<ReserveInventoryActivity> logger)
    : WorkflowActivity<ReservationRequest, ReservationResult>
{
    public override Task<ReservationResult> RunAsync(WorkflowActivityContext context, ReservationRequest input)
    {
        // Non-deterministic calls are fine here: activities are not replayed.
        var reservationId = Guid.NewGuid().ToString("N");
        var reservedAt = DateTime.UtcNow;

        LogReserved(logger, input.OrderId, reservationId, input.WarehouseRegion);
        return Task.FromResult(new ReservationResult(reservationId, reservedAt));
    }

    [LoggerMessage(LogLevel.Information, "Reserved stock for order {OrderId} as {ReservationId} in {Region}")]
    static partial void LogReserved(ILogger logger, string OrderId, string ReservationId, string Region);
}
