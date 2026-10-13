using ShopApi.Models;
using ShopApi.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<OrderStore>();

var app = builder.Build();

app.MapGet("/orders/{id}", (string id, OrderStore store) =>
    store.Get(id) is { } order ? Results.Ok(order) : Results.NotFound());

app.MapPost("/orders", (Order order, OrderStore store) =>
{
    store.Add(order);
    return Results.Created($"/orders/{order.Id}", order);
});

app.Run();
