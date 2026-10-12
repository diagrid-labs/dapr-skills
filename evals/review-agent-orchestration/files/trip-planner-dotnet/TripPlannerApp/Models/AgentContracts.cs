namespace TripPlannerApp.Models;

public static class AgentNames
{
    public const string Flights = "flights";
    public const string Hotels = "hotels";
    public const string Coordinator = "coordinator";
}

public sealed record TripRequest(string Origin, string Destination, string DepartureDate, int Nights);

public sealed record TripProposal(string Proposal);
