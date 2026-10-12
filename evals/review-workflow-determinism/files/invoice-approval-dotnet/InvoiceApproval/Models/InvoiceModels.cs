namespace InvoiceApproval.Models;

public record InvoiceLine(string Description, decimal Amount);
public record InvoiceInput(string Id, string VendorId, List<InvoiceLine> Lines);
public record InvoiceOutput(string InvoiceId, string Status, DateTime DecidedAt);

public record LineCheck(string InvoiceId, int LineNumber, InvoiceLine Line);
public record LineCheckResult(int LineNumber, bool IsValid);

public record ApprovalDecision(bool IsApproved, string ApprovedBy);
public record ApprovalRequest(string InvoiceId, string RequestId, decimal Total, DateTime RequestedAt);
public record PaymentInstruction(string InvoiceId, string PaymentReference, decimal Total);
public record PaymentConfirmation(string PaymentId, DateTime PaidAt);

public record ReminderState(string InvoiceId, int RemindersSent);
public record ReminderStatus(bool IsSettled);
