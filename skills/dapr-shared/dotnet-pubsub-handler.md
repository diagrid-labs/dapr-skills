# Event handler and dead-letter handler (.NET)

One handler class holds the business logic for every HTTP-pushed subscription type (declarative and
programmatic). Resolve every placeholder from the specification interview before copying this file; the
vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md). Replace `<ProjectNamespace>` with the
namespace of the project the file lives in. The streaming equivalent is in
[dotnet-pubsub-messaging.md](dotnet-pubsub-messaging.md).

## <EventName>Handler

```csharp
using System.Collections.Concurrent;
using System.Text.Json;

namespace <ProjectNamespace>;

public interface IProcessedEvents
{
    bool IsProcessed(string id);
    void MarkProcessed(string id);
}

public sealed class InMemoryProcessedEvents : IProcessedEvents
{
    private readonly ConcurrentDictionary<string, byte> _processed = new();
    public bool IsProcessed(string id) => _processed.ContainsKey(id);
    public void MarkProcessed(string id) => _processed.TryAdd(id, 0);
}

public sealed class <EventName>Handler(IProcessedEvents processedEvents, ILogger<<EventName>Handler> logger)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IResult> HandleAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        <EventName>? <eventVar>;
        try
        {
            <eventVar> = await JsonSerializer.DeserializeAsync<<EventName>>(request.Body, JsonOptions, cancellationToken);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Dropping malformed <EventDescription> event");
            return Drop();
        }

        if (<eventVar> is null || <ValidationCondition>)
        {
            logger.LogWarning("Dropping invalid <EventDescription> event");
            return Drop();
        }

        if (processedEvents.IsProcessed(<eventVar>.<IdProperty>))
        {
            logger.LogInformation("<EventDescription> {<IdProperty>} was already processed; acknowledging the duplicate", <eventVar>.<IdProperty>);
            return Success();
        }

        <HandlerBody>
        processedEvents.MarkProcessed(<eventVar>.<IdProperty>);
        return Success();
    }

    public static IResult Success() => Results.Ok(new { status = "SUCCESS" });
    public static IResult Drop() => Results.Ok(new { status = "DROP" });
}
```

`<ValidationCondition>` and `<HandlerBody>` come from the interview:

- `<ValidationCondition>` rejects a message that cannot be acted on, using the fields the user described.
  It always checks that `<IdProperty>` is present, because the idempotency store is keyed by it:
  `string.IsNullOrWhiteSpace(<eventVar>.<IdProperty>)`, joined with `||` to any other check the domain
  needs (a quantity that must be positive, a status that must be one of a known set).
- `<HandlerBody>` is what the user said the subscriber should do with the event. When the user described
  no action beyond receiving it, log the event at information level with its identifying fields and
  nothing else — never invent a side effect the user did not ask for. Work that can fail transiently
  belongs here and must be allowed to throw; see the key points below.

With several events, add one handler class per event and share the single `IProcessedEvents` store.

## Dead-letter handler

```csharp
namespace <ProjectNamespace>;

public sealed class DeadLetterLogger(ILogger<DeadLetterLogger> logger)
{
    public async Task<IResult> HandleAsync(HttpRequest request, CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(request.Body);
        var body = await reader.ReadToEndAsync(cancellationToken);
        logger.LogError("Dead-lettered <EventDescription> event: {Body}", body);
        return <EventName>Handler.Success();
    }
}
```

Registration:

```csharp
builder.Services.AddSingleton<IProcessedEvents, InMemoryProcessedEvents>();
builder.Services.AddSingleton<<EventName>Handler>();
builder.Services.AddSingleton<DeadLetterLogger>();
```

## Key points

- The body is read with `JsonSerializer` (not model binding), so malformed input becomes DROP instead of an automatic 400, which Dapr would retry forever.
- Invalid input returns DROP. DROP is not redelivered; it discards the message, or forwards it to the dead-letter topic when the subscription configures one (verified). A dead-letter route therefore also sees DROPped messages.
- Duplicates return SUCCESS.
- Transient failures must throw: ASP.NET Core returns 500 and Dapr retries according to the resiliency policy, and after the retries it forwards the message to the dead-letter topic.
- Replace `InMemoryProcessedEvents` with a state store before production; it is lost on restart and not shared between replicas.
- With `UseCloudEvents()`, raw subscriptions also arrive as the decoded bytes, so the same handler works for both.
- `JsonSerializerDefaults.Web` is used because `JsonSerializerOptions.Web` does not exist on net8.0.
- A controller action returning `Task<IResult>` executes the result on net8.0 and net10.0 (verified), so the same handler serves the minimal API and controller forms.
- The dead-letter route receives the unwrapped payload when `UseCloudEvents` is on.
