using DeclarativeApp;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IProcessedOrders, InMemoryProcessedOrders>();
builder.Services.AddSingleton<OrderPlacedHandler>();
builder.Services.AddSingleton<DeadLetterLogger>();

var app = builder.Build();

app.UseCloudEvents();

app.MapPost("/events/pubsub/orders",
    (HttpRequest request, OrderPlacedHandler handler, CancellationToken cancellationToken) =>
        handler.HandleAsync(request, cancellationToken));

app.MapPost("/events/pubsub/orders/large",
    (HttpRequest request, OrderPlacedHandler handler, CancellationToken cancellationToken) =>
        handler.HandleAsync(request, cancellationToken));

app.MapPost("/events/pubsub/orders-deadletter",
    (HttpRequest request, DeadLetterLogger deadLetters, CancellationToken cancellationToken) =>
        deadLetters.HandleAsync(request, cancellationToken));

app.Run();
