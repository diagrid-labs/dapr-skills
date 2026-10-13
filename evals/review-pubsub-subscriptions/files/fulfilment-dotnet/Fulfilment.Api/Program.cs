using Dapr;
using Fulfilment.Api;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDaprClient();
builder.Services.AddSingleton<RawPublisher>();

var app = builder.Build();

app.UseRouting();
app.UseEndpoints(endpoints =>
{
    endpoints.MapPost("/events/pubsub/shipments", (HttpRequest request) => Results.Ok(new { status = "SUCCESS" }))
        .WithTopic("pubsub", "shipments"); // SEED DPS-SUB-014

    endpoints.MapPost("/events/pubsub/returns", (HttpRequest request) => Results.Ok(new { status = "SUCCESS" }))
        .WithTopic("pubsub", "returns"); // SEED DPS-SUB-001

    endpoints.MapPost("/orders/raw", async (OrderPlaced order, RawPublisher publisher, CancellationToken cancellationToken) =>
    {
        await publisher.PublishAsync(order, cancellationToken);
        return Results.Accepted($"/orders/{order.OrderId}");
    });
});
app.UseCloudEvents(); // SEED DPS-SUB-003

app.Run();
