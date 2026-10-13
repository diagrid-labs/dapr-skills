using Checkout;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDaprClient();
builder.Services.AddSingleton<CheckoutPublisher>();

var app = builder.Build();

app.MapPost("/checkout", async (OrderPlaced order, CheckoutPublisher publisher) =>
{
    await publisher.PublishOrderAsync(order);
    return Results.Accepted($"/orders/{order.OrderId}");
});

app.Run();
