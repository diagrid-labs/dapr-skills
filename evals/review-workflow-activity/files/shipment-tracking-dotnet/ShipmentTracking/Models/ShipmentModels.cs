namespace ShipmentTracking.Models;

public record ShipmentInput(string Id, string OrderId, string CustomerEmail, string Carrier);
public record ShipmentOutput(string OrderId, string TrackingNumber, string LabelId);

public record LabelRequest(string OrderId, string Carrier, string IdempotencyKey);
public record LabelResult(string LabelId, string TrackingNumber, DateTime CreatedAt);

public record TrackingNotification(string OrderId, string CustomerEmail, string TrackingNumber, string IdempotencyKey);
public record NotificationResult(string MessageId);
