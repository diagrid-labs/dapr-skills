using System.ComponentModel;
using Microsoft.Extensions.AI;
using ClaimsIntakeApp.Models;

namespace ClaimsIntakeApp.Tools;

internal static class PolicyTools
{
    private static readonly Dictionary<string, PolicyCoverage> Policies = new()
    {
        ["POL-88120"] = new("POL-88120", "home contents", 250m),
        ["POL-90311"] = new("POL-90311", "car, all risk", 500m),
    };

    public static AIFunction GetPolicyCoverage { get; } = AIFunctionFactory.Create(GetPolicyCoverageImpl, name: "GetPolicyCoverage");

    [Description("Return the coverage type and deductible for a policy number.")]
    private static PolicyCoverage GetPolicyCoverageImpl(
        [Description("Policy number, e.g. 'POL-88120'.")] string policyNumber) =>
        Policies.TryGetValue(policyNumber, out var coverage) ? coverage : new(policyNumber, "unknown", 0m);
}
