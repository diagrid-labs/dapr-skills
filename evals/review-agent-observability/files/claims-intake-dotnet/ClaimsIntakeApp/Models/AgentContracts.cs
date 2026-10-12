namespace ClaimsIntakeApp.Models;

public sealed record AgentRunRequest(string Prompt, string? SessionId = null);

public sealed record AgentRunReply(string Output, string? SessionId);

public sealed record PolicyCoverage(string PolicyNumber, string Coverage, decimal Deductible);
