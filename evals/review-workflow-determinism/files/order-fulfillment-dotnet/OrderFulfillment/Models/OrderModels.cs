namespace OrderFulfillment.Models;

public record OrderLine(string Sku, int Quantity);
public record OrderRequest(string OrderId, string CustomerId, List<OrderLine> Items, decimal Total);
public record OrderResult(string OrderId, bool IsSuccess, string? TransactionId, DateTime ReceivedAt);

public record ReservationRequest(string OrderId, List<OrderLine> Items, string WarehouseRegion);
public record ReservationResult(string ReservationId, DateTime ReservedAt);

public record PaymentRequest(string OrderId, string CustomerId, decimal Amount);
public record PaymentResult(string TransactionId);

public record ShipmentRequest(string OrderId, string ShipmentReference, DateTime PromisedBy);
public record ShipmentResult(string TrackingNumber);

public record SyncRequest(string WarehouseId);
