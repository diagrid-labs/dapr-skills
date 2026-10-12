using System.ComponentModel;
using Microsoft.Extensions.AI;
using FaqBotApp.Models;

namespace FaqBotApp.Tools;

internal static class FaqTools
{
    private static readonly FaqEntry[] Entries =
    [
        new("How many vacation days do I get?", "Full-time employees get 25 vacation days per year."),
        new("When is payday?", "Salaries are paid on the 25th of every month."),
    ];

    public static AIFunction LookupFaq { get; } = AIFunctionFactory.Create(LookupFaqImpl, name: "LookupFaq");

    [Description("Look up HR FAQ entries that match a question and return at most three.")]
    private static IReadOnlyList<FaqEntry> LookupFaqImpl(
        [Description("Keyword from the employee's question, e.g. 'vacation'.")] string keyword) =>
        Entries.Where(e => e.Question.Contains(keyword, StringComparison.OrdinalIgnoreCase)).Take(3).ToList();
}
