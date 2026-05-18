# .NET Workflow Gotchas

.NET-specific mistakes and anti-patterns. See also `references/core/gotchas.md` for language-agnostic concepts.

---

## Forgetting `sealed` on Workflow and Activity Classes

```csharp
// BAD — allows subclassing, which can cause unexpected behavior with the workflow registry
internal class MyWorkflow : Workflow<string, string>
{
    public override Task<string> RunAsync(WorkflowContext context, string input)
        => Task.FromResult(input);
}

// GOOD — mark as sealed; workflows are registered by type name and should not be subclassed
internal sealed class MyWorkflow : Workflow<string, string>
{
    public override Task<string> RunAsync(WorkflowContext context, string input)
        => Task.FromResult(input);
}
```

Workflow and activity classes are looked up by type name at runtime. Subclassing can introduce name collisions and makes the inheritance hierarchy harder to reason about.

---

## Using `async void` in Workflow Code

```csharp
// BAD — async void is fire-and-forget; exceptions are silently lost
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    async void DoWork() // WRONG
    {
        await context.CallActivityAsync(nameof(SomeActivity), null);
    }
    DoWork(); // task is not tracked
    return "done"; // workflow may complete before DoWork finishes
}

// GOOD — return Task and await it
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    await context.CallActivityAsync(nameof(SomeActivity), null);
    return "done";
}
```

`async void` bypasses the workflow scheduler. The Dapr runtime cannot track unobserved tasks, making the workflow non-deterministic.

---

## LINQ Deferred Execution with Workflow Tasks

```csharp
// BAD — LINQ Select creates an IEnumerable that is lazily evaluated
// The tasks may be started in an unexpected order or multiple times
var tasks = items.Select(item =>
    context.CallActivityAsync<string>(nameof(ProcessActivity), item));

// Calling ToList() eagerly evaluates LINQ, but it's easy to miss this
var results = await Task.WhenAll(tasks); // tasks created lazily — order not guaranteed

// GOOD — build the task list explicitly before awaiting
var tasks = new List<Task<string>>();
foreach (var item in items)
{
    tasks.Add(context.CallActivityAsync<string>(nameof(ProcessActivity), item));
}
var results = await Task.WhenAll(tasks);
```

LINQ deferred execution means the lambda runs when the sequence is iterated, not when `Select` is called. This makes it hard to reason about when workflow tasks are actually scheduled relative to the replay point.

---

## `Task.Run()` or `Thread.Start()` in Workflow Code

```csharp
// BAD — creates work on a thread pool thread outside the workflow dispatch thread
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    var result = await Task.Run(async () =>
    {
        // This runs on a different thread — workflow APIs are NOT safe here
        return await context.CallActivityAsync<string>(nameof(ProcessActivity), input);
    });
    return result;
}

// GOOD — call context APIs directly on the workflow dispatch thread
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    return await context.CallActivityAsync<string>(nameof(ProcessActivity), input);
}
```

All `WorkflowContext` method calls must be made on the workflow dispatch thread (the thread that calls `RunAsync`). `Task.Run` schedules work on a thread pool thread where `context` calls will throw `InvalidOperationException`.

---

## `HttpClient` in Workflow Code Instead of Activities

```csharp
// BAD — direct HTTP call in workflow is non-deterministic and not durable
public override async Task<string> RunAsync(WorkflowContext context, string url)
{
    using var client = new HttpClient(); // WRONG
    return await client.GetStringAsync(url);
}

// GOOD — delegate to an activity
public override async Task<string> RunAsync(WorkflowContext context, string url)
{
    return await context.CallActivityAsync<string>(nameof(FetchUrlActivity), url);
}

internal sealed class FetchUrlActivity : WorkflowActivity<string, string>
{
    private readonly HttpClient _client;

    public FetchUrlActivity(HttpClient client)
    {
        _client = client;
    }

    public override Task<string> RunAsync(WorkflowActivityContext context, string url)
        => _client.GetStringAsync(url);
}
```

HTTP calls in workflow code produce different results on replay (server may be unavailable, response may differ). They also bypass Dapr's activity retry and durability guarantees.

---

## Forgetting to Register Workflows or Activities

```csharp
// BAD — ProcessActivity is called but not registered; will fail at runtime
builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<OrderWorkflow>();
    // ProcessActivity is missing!
});

// GOOD — register every type used in the workflow
builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<OrderWorkflow>();
    options.RegisterActivity<ValidateActivity>();
    options.RegisterActivity<ProcessActivity>();
    options.RegisterActivity<NotifyActivity>();
});
```

Unregistered workflows or activities cause a runtime error when the Dapr runtime tries to dispatch the task. There is no compile-time check — the SDK's Roslyn analyzer (`Dapr.Workflow.Analyzers`) can detect missing registrations at build time if included.

---

## `CancellationToken` Misuse in Workflow Code

```csharp
// BAD — passing external CancellationTokens to workflow APIs
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    // CreateTimer accepts a CancellationToken for cancelling the timer itself,
    // but do NOT use an external token derived from wall-clock time
    await context.CreateTimer(TimeSpan.FromHours(1), cts.Token); // Timer cancelled after 5s real-time — non-deterministic!
    return "done";
}

// GOOD — use a durable timer with ContinueAsNew or WaitForExternalEventAsync with timeout
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    // This timeout is durable — survives restarts
    try
    {
        await context.WaitForExternalEventAsync<bool>("proceed", TimeSpan.FromHours(1));
    }
    catch (TaskCanceledException)
    {
        return "timed out";
    }
    return "done";
}
```

`CancellationToken` based on real wall-clock time (`CancellationTokenSource(TimeSpan)`) is non-deterministic — the cancellation fires based on elapsed real time, not workflow time. Use `context.CreateTimer` or `WaitForExternalEventAsync` with a `TimeSpan` for durable, replay-safe timeouts.

---

## Logging Without `CreateReplaySafeLogger`

```csharp
// BAD — logs are duplicated on every replay
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    _logger.LogInformation("Processing {Input}", input); // Duplicated on replay

    return await context.CallActivityAsync<string>(nameof(ProcessActivity), input);
}

// GOOD — use replay-safe logger (only logs when not replaying)
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    var logger = context.CreateReplaySafeLogger<MyWorkflow>();
    logger.LogInformation("Processing {Input}", input); // Logged once

    return await context.CallActivityAsync<string>(nameof(ProcessActivity), input);
}
```

Standard `ILogger` injected via DI writes on every replay, producing duplicate and misleading log lines. Always use `context.CreateReplaySafeLogger<T>()` in workflow code.

---

## Calling `context` APIs After `ContinueAsNew`

```csharp
// BAD — calling context APIs after ContinueAsNew is unreachable but confusing
public override async Task<object> RunAsync(WorkflowContext context, MonitorState state)
{
    await context.CallActivityAsync(nameof(CheckActivity), state.ResourceId);
    await context.CreateTimer(TimeSpan.FromMinutes(5));

    context.ContinueAsNew(state with { Cycle = state.Cycle + 1 });

    // This line is never reached in the new execution — but may run once on the current execution
    await context.CallActivityAsync(nameof(SomeOtherActivity), null); // Confusing!
    return null!;
}

// GOOD — return immediately after ContinueAsNew
public override async Task<object> RunAsync(WorkflowContext context, MonitorState state)
{
    await context.CallActivityAsync(nameof(CheckActivity), state.ResourceId);
    await context.CreateTimer(TimeSpan.FromMinutes(5));

    context.ContinueAsNew(state with { Cycle = state.Cycle + 1 });
    return null!; // Return immediately
}
```
