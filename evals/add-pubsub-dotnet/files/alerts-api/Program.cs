using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var alerts = new ConcurrentDictionary<string, Alert>();

app.MapGet("/alerts", () => alerts.Values);

app.MapPost("/alerts", (Alert alert) =>
{
    alerts[alert.Id] = alert;
    return Results.Created($"/alerts/{alert.Id}", alert);
});

app.Run();

public sealed record Alert(string Id, string Severity, string Message);
