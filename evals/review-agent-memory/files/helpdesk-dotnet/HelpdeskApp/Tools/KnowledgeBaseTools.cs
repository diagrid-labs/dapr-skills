using System.ComponentModel;
using Microsoft.Extensions.AI;
using HelpdeskApp.Models;

namespace HelpdeskApp.Tools;

internal static class KnowledgeBaseTools
{
    private static readonly KnowledgeBaseArticle[] Articles =
    [
        new("Reset your VPN token", "Open the self-service portal, choose 'VPN', then 'Reset token'."),
        new("Laptop does not charge", "Try another USB-C port, then book a hardware swap."),
    ];

    public static AIFunction SearchKnowledgeBase { get; } = AIFunctionFactory.Create(SearchKnowledgeBaseImpl, name: "SearchKnowledgeBase");

    [Description("Search the helpdesk knowledge base and return at most three matching articles.")]
    private static IReadOnlyList<KnowledgeBaseArticle> SearchKnowledgeBaseImpl(
        [Description("Search term, e.g. 'vpn'.")] string query) =>
        Articles.Where(a => a.Title.Contains(query, StringComparison.OrdinalIgnoreCase)).Take(3).ToList();
}
