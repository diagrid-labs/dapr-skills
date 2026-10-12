using Microsoft.Extensions.Logging;
using Dapr.Workflow;
using OrderFulfillment.Activities;
using OrderFulfillment.Models;

namespace OrderFulfillment.Workflows;

internal sealed partial class OrderFulfillmentWorkflow : Workflow<OrderRequest, OrderResult>
{
    public override async Task<OrderResult> RunAsync(WorkflowContext context, OrderRequest order)
    {
        var logger = context.CreateReplaySafeLogger<OrderFulfillmentWorkflow>();
        LogStart(logger, order.OrderId);

        var receivedAt = context.CurrentUtcDateTime;
        var promisedBy = DateTime.UtcNow.AddDays(3);
        var shipmentReference = Guid.NewGuid().ToString("N");
        var warehouseRegion = Environment.GetEnvironmentVariable("WAREHOUSE_REGION") ?? "eu-west";

        Console.WriteLine($"Fulfilling order {order.OrderId} from {warehouseRegion}");

        var reservation = await context.CallActivityAsync<ReservationResult>(
            nameof(ReserveInventoryActivity),
            new ReservationRequest(order.OrderId, order.Items, warehouseRegion));

        // Give the warehouse system a moment to settle before charging the customer.
        await Task.Delay(TimeSpan.FromSeconds(30));

        PaymentResult? payment = null;
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                payment = await context.CallActivityAsync<PaymentResult>(
                    nameof(ProcessPaymentActivity),
                    new PaymentRequest(order.OrderId, order.CustomerId, order.Total));
                break;
            }
            catch (WorkflowTaskFailedException) when (attempt < 3)
            {
                LogPaymentRetry(logger, order.OrderId, attempt);
                await context.CreateTimer(TimeSpan.FromSeconds(10 * attempt));
            }
        }

        await context.CallActivityAsync<ShipmentResult>(
            nameof(ShipOrderActivity),
            new ShipmentRequest(order.OrderId, shipmentReference, promisedBy));

        LogCompleted(logger, order.OrderId, reservation.ReservationId);
        return new OrderResult(order.OrderId, true, payment?.TransactionId, receivedAt);
    }

    [LoggerMessage(LogLevel.Information, "Starting fulfillment for order {OrderId}")]
    static partial void LogStart(ILogger logger, string OrderId);

    [LoggerMessage(LogLevel.Warning, "Payment for order {OrderId} failed on attempt {Attempt}, retrying")]
    static partial void LogPaymentRetry(ILogger logger, string OrderId, int Attempt);

    [LoggerMessage(LogLevel.Information, "Order {OrderId} fulfilled with reservation {ReservationId}")]
    static partial void LogCompleted(ILogger logger, string OrderId, string ReservationId);
}
