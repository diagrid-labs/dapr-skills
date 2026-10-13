using System.Text.Json;
using Fulfilment.Worker;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<FulfilmentDb>();

var app = builder.Build();

app.MapPost("/events/pubsub/orders", async (OrderPlaced order, FulfilmentDb db) => // SEED DPS-SUB-002
{
    if (!KnownCustomers.Contains(order.CustomerId))
    {
        return Results.NotFound(); // SEED DPS-SUB-004
    }

    try
    {
        db.Orders.Add(order); await db.SaveChangesAsync(); // SEED DPS-SUB-006
    }
    catch (Exception)
    {
        return Results.Ok(); // SEED DPS-SUB-005
    }

    return Results.Ok(new { status = "SUCCESS" });
});

app.MapPost("/events/pubsub/orders/large", (HttpRequest request) => Results.Ok(new { status = "SUCCESS" }));

app.MapPost("/events/pubsub/refunds", async (HttpRequest request) =>
{
    try
    {
        using var envelope = await JsonDocument.ParseAsync(request.Body);
        return Results.Ok(new { status = "SUCCESS" });
    }
    catch (JsonException)
    {
        return Results.BadRequest(); // SEED DPS-SUB-008
    }
});

app.Run();
