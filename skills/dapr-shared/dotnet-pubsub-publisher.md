# Publisher (.NET)

Code for publishing `<EventName>` events to the `<TopicName>` topic with `DaprClient` from
`Dapr.AspNetCore` 1.18.10. Resolve every placeholder from the specification interview before copying
this file; the vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md). Replace
`<ProjectNamespace>` with the namespace of the project the file lives in.

## Message contract

In a create skill with role `both`, the contract goes in `<ProjectRoot>.Contracts/<EventName>.cs` and
`<ProjectRoot>.Contracts/PubSubNames.cs`. In every other case it goes in the `Models` folder of the
project.

```csharp
namespace <ProjectNamespace>;

public sealed record <EventName>(<EventFields>);
```

```csharp
namespace <ProjectNamespace>;

public static class PubSubNames
{
    public const string PubSubName = "pubsub";
    public const string <TopicConstant> = "<TopicName>";
    public const string <DeadLetterTopicConstant> = "<DeadLetterTopicName>";
}
```

`<EventFields>` comes from the interview: one positional member per field the user described, with
`<IdProperty>` among them. Records are serialized by `System.Text.Json`, so every member must be a
serializable type. When the interview produced several events, add one record per event and one
`<TopicConstant>`/`<DeadLetterTopicConstant>` pair per topic; keep a single `PubSubNames` class.

When an add skill reuses an existing pub/sub component with another name, `PubSubName` takes that name.

## <EventName>Publisher

```csharp
using Dapr.Client;

namespace <ProjectNamespace>;

public sealed record PublishFeatures(int? TtlInSeconds = null, bool RawPayload = false);

public sealed class <EventName>Publisher(DaprClient daprClient, ILogger<<EventName>Publisher> logger)
{
    public Task Publish<EventName>Async(<EventName> <eventVar>, CancellationToken cancellationToken = default) =>
        Publish<EventName>Async(<eventVar>, new PublishFeatures(), cancellationToken);

    public async Task Publish<EventName>Async(<EventName> <eventVar>, PublishFeatures features, CancellationToken cancellationToken = default)
    {
        var metadata = new Dictionary<string, string>();
        if (features.TtlInSeconds is { } ttl)
        {
            metadata["ttlInSeconds"] = ttl.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }
        if (features.RawPayload)
        {
            metadata["rawPayload"] = "true";
        }

        await daprClient.PublishEventAsync(PubSubNames.PubSubName, PubSubNames.<TopicConstant>, <eventVar>, metadata, cancellationToken);
        logger.LogInformation("Published <EventDescription> {<IdProperty>} to {Topic}", <eventVar>.<IdProperty>, PubSubNames.<TopicConstant>);
    }
}
```

With several events, give the class one `Publish<EventName>Async` pair per event and keep one
`PublishFeatures` record.

## Publish endpoint (minimal API)

In `Program.cs`, after `var app = builder.Build();`:

```csharp
app.MapPost("/<PublishRoute>", async (<EventName> <eventVar>, <EventName>Publisher publisher, CancellationToken cancellationToken) =>
{
    try
    {
        await publisher.Publish<EventName>Async(<eventVar>, cancellationToken);
        return Results.Accepted($"/<PublishRoute>/{<eventVar>.<IdProperty>}", new { <eventVar>.<IdProperty> });
    }
    catch (Dapr.DaprException ex)
    {
        return Results.Problem(title: "Publishing the <EventDescription> failed", detail: ex.Message,
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});
```

## Publish endpoint (controller)

`Controllers/<PublishResource>Controller.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;

namespace <ProjectNamespace>.Controllers;

[ApiController]
[Route("<PublishRoute>")]
public sealed class <PublishResource>Controller(<EventName>Publisher publisher) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> PostAsync(<EventName> <eventVar>, CancellationToken cancellationToken)
    {
        try
        {
            await publisher.Publish<EventName>Async(<eventVar>, cancellationToken);
            return Accepted($"/<PublishRoute>/{<eventVar>.<IdProperty>}", new { <eventVar>.<IdProperty> });
        }
        catch (Dapr.DaprException ex)
        {
            return Problem(title: "Publishing the <EventDescription> failed", detail: ex.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }
    }
}
```

## Registration

- Minimal API: `builder.Services.AddDaprClient();` and `builder.Services.AddSingleton<<EventName>Publisher>();`.
- Controllers: `builder.Services.AddControllers().AddDapr();` (this also registers `DaprClient`) and `builder.Services.AddSingleton<<EventName>Publisher>();`.
- In an add skill, skip `AddDaprClient()` when the project already has `AddDaprClient(` or `.AddDapr(`.

## Adding to an existing Program.cs or Startup.cs

- `Program.cs`: put the registrations after the last `builder.Services.Add*` line, and the endpoint after the last `app.Map*` line.
- `Startup.cs`: put the registrations in `ConfigureServices`, and the endpoint inside `app.UseEndpoints(endpoints => { ... })` as `endpoints.MapPost(...)`.
- In an add skill the route is `/pubsub/<PublishRoute>`, to keep it clear of the routes the project already serves. When the user accepts "publish from the existing endpoint", the existing handler gains an `<EventName>Publisher publisher` parameter and calls `await publisher.Publish<EventName>Async(new <EventName>(...), cancellationToken)` after its existing work succeeds. Its existing response stays unchanged.

## Recipe: bulk publish

Not scaffolded. Use it when the user asks for it:

```csharp
var response = await daprClient.BulkPublishEventAsync(PubSubNames.PubSubName, PubSubNames.<TopicConstant>, <eventVar>s, cancellationToken: cancellationToken);
if (response.FailedEntries.Count > 0)
{
    foreach (var failed in response.FailedEntries)
    {
        logger.LogError("Bulk publish failed for entry {EntryId}: {Error}", failed.Entry.EntryId, failed.ErrorMessage);
    }
    throw new InvalidOperationException($"{response.FailedEntries.Count} <EventDescription> events were not published.");
}
```

## Key points

- `DaprClient` is a singleton; do not create one per request.
- Always `await` the publish call.
- `DaprException` maps to 503, never to a success response. Verified: with no sidecar running the endpoint returns 503.
- Metadata values are strings (`ttlInSeconds`, `rawPayload`).
- Never set `cloudevent.trace*` metadata; the SDK and sidecar propagate trace context.
- The raw payload key is `rawPayload`. Raw payloads are not wrapped in a CloudEvent, so they lose tracing and CloudEvent-based dedupe.
- Never add `Dapr.Client` as a package reference; it comes in through `Dapr.AspNetCore`.
