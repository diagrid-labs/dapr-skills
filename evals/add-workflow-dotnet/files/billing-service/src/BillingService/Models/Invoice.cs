namespace BillingService.Models;

public sealed record Invoice(string Id, string CustomerEmail, decimal Amount, bool Paid);
