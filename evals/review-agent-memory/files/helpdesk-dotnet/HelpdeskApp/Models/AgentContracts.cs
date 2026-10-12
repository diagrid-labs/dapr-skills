namespace HelpdeskApp.Models;

public static class AgentNames
{
    public const string Classifier = "classifier";
    public const string Responder = "responder";
}

public sealed record AskRequest(string Question);

public sealed record AskReply(string Answer);

public sealed record TicketRequest(string Reporter, string Description);

public sealed record TicketTriage(string Category, string? DraftResponse);

public sealed record KnowledgeBaseArticle(string Title, string Summary);
