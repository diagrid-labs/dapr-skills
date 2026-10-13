using OrdersApi.Models;
using OrdersApi.Services;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<OrderService>();

var app = builder.Build();

app.MapGet("/orders/{id}", (string id, OrderService orders) =>
    orders.Get(id) is { } order ? Results.Ok(order) : Results.NotFound());

app.MapPost("/orders", (Order order, OrderService orders) =>
    Results.Created($"/orders/{order.Id}", orders.Add(order)));

app.Run();
