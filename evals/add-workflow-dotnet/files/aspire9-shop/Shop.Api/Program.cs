using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<ConcurrentDictionary<string, Checkout>>();

var app = builder.Build();

app.MapPost("/checkouts", (Checkout checkout, ConcurrentDictionary<string, Checkout> checkouts) =>
{
    if (checkout.Items.Count == 0)
    {
        return Results.BadRequest("A checkout needs at least one item.");
    }

    checkouts[checkout.Id] = checkout;
    return Results.Created($"/checkouts/{checkout.Id}", checkout);
});

app.MapGet("/checkouts/{id}", (string id, ConcurrentDictionary<string, Checkout> checkouts) =>
    checkouts.TryGetValue(id, out var checkout) ? Results.Ok(checkout) : Results.NotFound());

app.Run();

public sealed record Checkout(string Id, string CustomerId, IReadOnlyList<string> Items);
