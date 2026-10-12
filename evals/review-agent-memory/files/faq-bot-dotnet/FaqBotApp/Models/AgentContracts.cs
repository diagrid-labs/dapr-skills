namespace FaqBotApp.Models;

public sealed record AgentRunRequest(string Prompt, string? SessionId = null);

public sealed record AgentRunReply(string Output, string? SessionId);

public sealed record FaqEntry(string Question, string Answer);
