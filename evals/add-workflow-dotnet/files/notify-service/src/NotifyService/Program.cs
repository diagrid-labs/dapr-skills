using Dapr.Client;
using NotifyService.Models;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDaprClient();

var app = builder.Build();

app.MapPost("/notifications", async (Notification notification, DaprClient dapr) =>
{
    await dapr.PublishEventAsync("notifications-pubsub", "notifications", notification);
    return Results.Accepted();
});

app.Run();
