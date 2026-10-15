# Declarative subscriber (.NET)

The subscription lives in `resources/subscription.yaml` (see [dapr-pubsub-subscription.md](dapr-pubsub-subscription.md)); the code only maps the routes the YAML names. The handlers are in [dotnet-pubsub-handler.md](dotnet-pubsub-handler.md). Resolve every placeholder from the specification interview before copying this file; the vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md). Replace `<ProjectNamespace>` with the namespace of the project the file lives in. `Dapr.AspNetCore` 1.18.10 is referenced for `UseCloudEvents`.

## Minimal API form

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IProcessedEvents, InMemoryProcessedEvents>();
builder.Services.AddSingleton<<EventName>Handler>();
builder.Services.AddSingleton<DeadLetterLogger>();

var app = builder.Build();

app.UseCloudEvents();

app.MapPost("<SubscribeRoute>",
    (HttpRequest request, <EventName>Handler handler, CancellationToken cancellationToken) =>
        handler.HandleAsync(request, cancellationToken));

app.MapPost("<DeadLetterRoute>",
    (HttpRequest request, DeadLetterLogger deadLetters, CancellationToken cancellationToken) =>
        deadLetters.HandleAsync(request, cancellationToken));

app.Run();
```

Plus `resources/subscription.yaml` from `dapr-pubsub-subscription.md`. With several events, add one
`MapPost` and one handler registration per event, and one `Subscription` block per topic.

## Controller form

- `builder.Services.AddControllers();`. Add `.AddDapr()` only when the same project also publishes.
- `app.UseCloudEvents(); app.MapControllers();`

```csharp
using Microsoft.AspNetCore.Mvc;

namespace <ProjectNamespace>.Controllers;

[ApiController]
public sealed class <TopicResource>EventsController(<EventName>Handler handler, DeadLetterLogger deadLetters) : ControllerBase
{
    [HttpPost("<SubscribeRoute>")]
    public Task<IResult> <TopicResource>Async(CancellationToken cancellationToken) =>
        handler.HandleAsync(Request, cancellationToken);

    [HttpPost("<DeadLetterRoute>")]
    public Task<IResult> <TopicResource>DeadLetterAsync(CancellationToken cancellationToken) =>
        deadLetters.HandleAsync(Request, cancellationToken);
}
```

## Routing rules

Only when the user asks for content-based routing. Add `app.MapPost("<SubscribeRoute>/<RuleName>", ...)` (or `[HttpPost("<SubscribeRoute>/<RuleName>")]`) that calls the same handler, plus the YAML `rules` block from `dapr-pubsub-subscription.md`. `<RuleName>` is a short lowercase name for the case the rule selects, taken from what the user described. The `match` expression and the path live in the YAML only; the code never repeats them.

## Raw payload

Set `spec.metadata.rawPayload: "true"` in the YAML. No code change is needed: `UseCloudEvents` decodes `data_base64` into the body, so `<EventName>Handler` reads the same bytes either way. The metadata key is exactly `rawPayload`.

## Startup.cs placement

```csharp
app.UseRouting();
app.UseCloudEvents();
app.UseEndpoints(endpoints =>
{
    endpoints.MapPost("<SubscribeRoute>", ...);
});
```

`UseCloudEvents` must come **before** `UseEndpoints`.

## SDK-free alternative

Documented only, not scaffolded. Bind a local envelope record and read `.Data`:

```csharp
public sealed record CloudEventEnvelope<T>(string Id, string Source, string Type, T? Data);
```

This works without `Dapr.AspNetCore`, but loses raw-payload decoding.

## Key points

- There is no `MapSubscribeHandler`, `WithTopic` or `[Topic]` in a declarative subscriber: the YAML is the subscription.
- `UseCloudEvents()` is still required, and must come before any `Map*` subscriber route. Without it the typed body binds the CloudEvent envelope and every field is null.
- Every route in the YAML must exist here; a missing route returns 404 and the message is dropped.
- `scopes` in the YAML must equal the app-id of this app.
- The subscription file hot-reloads when it changes in the resources folder.
- Verified: plain `MapPost` handlers with `UseCloudEvents()` and a v2alpha1 `subscription.yaml` receive the published message; the sidecar logs `Found Subscription: <TopicName>-subscription`.
- Never add a programmatic subscription for the same topic in the same app.
