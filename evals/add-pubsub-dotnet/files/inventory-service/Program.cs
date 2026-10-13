using Dapr;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.UseCloudEvents();
app.MapSubscribeHandler();

app.MapPost("/events/messagebus/orders", (StockReservation reservation, ILogger<Program> logger) =>
{
    logger.LogInformation("Reserving {Quantity} of {Sku}", reservation.Quantity, reservation.Sku);
    return Results.Ok();
}).WithTopic("messagebus", "orders");

app.Run();

public sealed record StockReservation(string OrderId, string Sku, int Quantity);
