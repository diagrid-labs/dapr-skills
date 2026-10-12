using System.ComponentModel;
using Microsoft.Extensions.AI;

namespace TripPlannerApp.Tools;

internal static class TravelTools
{
    public static AIFunction SearchFlights { get; } = AIFunctionFactory.Create(SearchFlightsImpl, name: "SearchFlights");

    public static AIFunction SearchHotels { get; } = AIFunctionFactory.Create(SearchHotelsImpl, name: "SearchHotels");

    [Description("Return up to three direct flights between two cities on a date.")]
    private static string[] SearchFlightsImpl(
        [Description("Departure city, e.g. 'Amsterdam'.")] string origin,
        [Description("Arrival city, e.g. 'Lisbon'.")] string destination,
        [Description("Departure date in ISO format, e.g. '2026-11-03'.")] string date) =>
        [$"TP671 {origin}-{destination} {date} EUR 129", $"KL1693 {origin}-{destination} {date} EUR 164"];

    [Description("Return up to three hotels in a city with the price per night.")]
    private static string[] SearchHotelsImpl(
        [Description("City, e.g. 'Lisbon'.")] string city,
        [Description("Number of nights.")] int nights) =>
        [$"Hotel Avenida, {city}: EUR 110/night x {nights}", $"Casa do Rio, {city}: EUR 95/night x {nights}"];
}
