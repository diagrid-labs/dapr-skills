using CleanPublisher;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDaprClient();
builder.Services.AddSingleton<OrderPublisher>();

var app = builder.Build();

app.MapPost("/orders", async (OrderPlaced order, OrderPublisher publisher, CancellationToken cancellationToken) =>
{
    try
    {
        await publisher.PublishOrderPlacedAsync(order, cancellationToken);
        return Results.Accepted($"/orders/{order.OrderId}", new { order.OrderId });
    }
    catch (Dapr.DaprException ex)
    {
        return Results.Problem(title: "Publishing the order failed", detail: ex.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.Run();
