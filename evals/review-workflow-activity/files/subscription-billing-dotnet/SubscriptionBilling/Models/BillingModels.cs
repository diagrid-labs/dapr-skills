namespace SubscriptionBilling.Models;

public record BillingInput(string Id, string SubscriptionId, string CustomerId, decimal Amount, string Email);
public record BillingOutput(string SubscriptionId, bool IsPaid, string? ChargeId);

public record ChargeRequest(string SubscriptionId, string CustomerId, decimal Amount);
public record ChargeResult(bool Succeeded, string? ChargeId);

public record LedgerEntry(string SubscriptionId, string ChargeId, decimal Amount);
public record LedgerResult(string EntryId, DateTime RecordedAt);

public record InvoiceEmail(string InvoiceId, string Email, decimal Amount);
public record EmailResult(bool Sent);

public record DunningRequest(string SubscriptionId, string CustomerId);
public record DunningResult(string DunningInstanceId);
