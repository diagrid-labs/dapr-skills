namespace ExpenseApproval.Models;

public record ExpenseClaim(string Id, string EmployeeId, decimal Amount, string Category);
public record ExpenseOutcome(string ClaimId, string Status);
public record ManagerDecision(bool IsApproved, string ManagerId);
public record ReimbursementRequest(string ClaimId, string EmployeeId, decimal Amount);
