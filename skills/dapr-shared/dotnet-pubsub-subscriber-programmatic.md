# Programmatic subscriber (.NET)

The app tells the sidecar what it subscribes to, through `GET /dapr/subscribe`. The handlers are in [dotnet-pubsub-handler.md](dotnet-pubsub-handler.md). Resolve every placeholder from the specification interview before copying this file; the vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md). Replace `<ProjectNamespace>` with the namespace of the project the file lives in. `Dapr.AspNetCore` 1.18.10 provides `UseCloudEvents`, `MapSubscribeHandler`, `WithTopic` and `[Topic]`.

## Minimal API form

The registrations are the same as the declarative form:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IProcessedEvents, InMemoryProcessedEvents>();
builder.Services.AddSingleton<<EventName>Handler>();
builder.Services.AddSingleton<DeadLetterLogger>();

var app = builder.Build();
```

Then (add `using Dapr;` at the top of `Program.cs`, before the first statement):

```csharp
app.UseCloudEvents();
app.MapSubscribeHandler();

app.MapPost("<SubscribeRoute>",
        (HttpRequest request, <EventName>Handler handler, CancellationToken cancellationToken) =>
            handler.HandleAsync(request, cancellationToken))
    .WithTopic(new TopicOptions
    {
        PubsubName = PubSubNames.PubSubName,
        Name = PubSubNames.<TopicConstant>,
        DeadLetterTopic = PubSubNames.<DeadLetterTopicConstant>,
    });

app.MapPost("<DeadLetterRoute>",
        (HttpRequest request, DeadLetterLogger deadLetters, CancellationToken cancellationToken) =>
            deadLetters.HandleAsync(request, cancellationToken))
    .WithTopic(PubSubNames.PubSubName, PubSubNames.<DeadLetterTopicConstant>);

app.Run();
```

With several events, repeat the `MapPost` + `.WithTopic` pair per topic.

## Controller form

`builder.Services.AddControllers().AddDapr();`, then `app.UseCloudEvents(); app.MapSubscribeHandler(); app.MapControllers();`, and the controller:

```csharp
using Dapr;
using Microsoft.AspNetCore.Mvc;

namespace <ProjectNamespace>.Controllers;

[ApiController]
public sealed class <TopicResource>EventsController(<EventName>Handler handler, DeadLetterLogger deadLetters) : ControllerBase
{
    [Topic(PubSubNames.PubSubName, PubSubNames.<TopicConstant>, PubSubNames.<DeadLetterTopicConstant>, false)]
    [HttpPost("<SubscribeRoute>")]
    public Task<IResult> <TopicResource>Async(CancellationToken cancellationToken) =>
        handler.HandleAsync(Request, cancellationToken);

    [Topic(PubSubNames.PubSubName, PubSubNames.<DeadLetterTopicConstant>)]
    [HttpPost("<DeadLetterRoute>")]
    public Task<IResult> <TopicResource>DeadLetterAsync(CancellationToken cancellationToken) =>
        deadLetters.HandleAsync(Request, cancellationToken);
}
```

## Routing rules

Only when the user asks for content-based routing. `<RuleName>` is a short lowercase name for the case the rule selects and `<MatchExpression>` is the CEL expression over `event.data`, both taken from what the user described.

- Minimal API: add a second endpoint `<SubscribeRoute>/<RuleName>` with `.WithTopic(new TopicOptions { PubsubName = PubSubNames.PubSubName, Name = PubSubNames.<TopicConstant>, Match = "<MatchExpression>", Priority = 1 })` that calls the same handler. The default endpoint keeps no `Match`.
- Controllers: add an action at `<SubscribeRoute>/<RuleName>` with `[Topic(PubSubNames.PubSubName, PubSubNames.<TopicConstant>, "<MatchExpression>", 1)]`.
- If the default endpoint also carries the dead-letter topic, keep it on the default endpoint only.
- Verified (with a `match` of `int(event.data.amount) > 1000`): `/dapr/subscribe` advertises `routes.default` plus `routes.rules`, a message with amount 1500 reaches the rule endpoint and amount 10 reaches the default endpoint.

## Raw payload

Set `EnableRawPayload = true` in `TopicOptions`, or use `[Topic(PubSubNames.PubSubName, PubSubNames.<TopicConstant>, true)]`. `UseCloudEvents` decodes the body, so `<EventName>Handler` is unchanged.

## Startup.cs placement

```csharp
app.UseRouting();
app.UseCloudEvents();
app.UseEndpoints(endpoints =>
{
    endpoints.MapSubscribeHandler();
    endpoints.MapControllers();
});
```

## Recipe: bulk subscribe

Not scaffolded. Add `.WithBulkSubscribe(new BulkSubscribeTopicOptions { TopicName = PubSubNames.<TopicConstant>, MaxMessagesCount = 100, MaxAwaitDurationMs = 1000 })` to the endpoint, and write a handler that returns a `BulkSubscribeAppResponse` with one `BulkSubscribeAppResponseEntry(entryId, BulkSubscribeAppResponseStatus.SUCCESS)` per entry (use `RETRY` or `DROP` for entries that need them).

## Key points

- `MapSubscribeHandler()` publishes the list on `GET /dapr/subscribe`; the sidecar reads it **once, at start-up**, so restart the sidecar after changing a topic. The advertised route has no leading slash (`events/pubsub/<TopicName>`); that is normal.
- `UseCloudEvents()` must come before the endpoints, and before any `Map*` subscriber route. Without it the typed body binds the CloudEvent envelope and every field is null.
- Never also add a `subscription.yaml` for the same topic in the same app.
- `TopicOptions` and `TopicAttribute` are in namespace `Dapr`.
- DROP is not redelivered, and is also forwarded to the dead-letter topic when one is configured.
