# .NET Workflow Determinism

## Overview

Dapr Workflow provides durable execution through **history replay**. When a workflow is unloaded and later resumed, the runtime re-executes the workflow code from the beginning, replaying previously recorded decisions from history. For this to work correctly, workflow code must produce the **same sequence of decisions** every time it runs.

This means any .NET API that produces different values on different calls — time, randomness, I/O — **must not appear in workflow code**. Instead, delegate those operations to activities or use the replay-safe APIs on `WorkflowContext`.

See `references/core/determinism.md` for the underlying mechanics.

## Forbidden: `DateTime.UtcNow` / `DateTimeOffset.UtcNow`

```csharp
// BAD — returns a different value on replay
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    var timestamp = DateTime.UtcNow; // NON-DETERMINISTIC
    return await context.CallActivityAsync<string>(nameof(StampActivity), timestamp);
}

// GOOD — same value returned on every replay
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    var timestamp = context.CurrentUtcDateTime; // DETERMINISTIC
    return await context.CallActivityAsync<string>(nameof(StampActivity), timestamp);
}
```

## Forbidden: `Guid.NewGuid()`

```csharp
// BAD — different GUID on each replay
var id = Guid.NewGuid();

// GOOD — deterministic GUID derived from workflow history
var id = context.NewGuid();
```

`context.NewGuid()` uses RFC 4122 §4.3 name-based UUID V5 seeded from the workflow instance ID, current time, and an internal sequence counter.

## Forbidden: `Random` / `RandomNumberGenerator`

```csharp
// BAD — non-deterministic
var value = Random.Shared.Next(1, 100);

// GOOD — delegate to an activity
var value = await context.CallActivityAsync<int>(nameof(GetRandomValueActivity), null);
```

## Forbidden: `async void` in Workflow Code

```csharp
// BAD — fire-and-forget; exceptions are unobservable and execution is untracked
async void FireAndForget() { await context.CallActivityAsync(nameof(SomeActivity), null); }

// GOOD — always return Task and await it
async Task DoWork() { await context.CallActivityAsync(nameof(SomeActivity), null); }
```

`async void` bypasses the workflow scheduler. The Dapr runtime cannot track tasks started this way, making the workflow non-deterministic and prone to silent failures.

## Forbidden: `Task.Run()` / `Thread.Start()`

```csharp
// BAD — creates work on thread pool threads outside the workflow scheduler
Task.Run(() => context.CallActivityAsync(nameof(SomeActivity), null));
new Thread(() => { /* workflow work */ }).Start();

// GOOD — only await workflow tasks directly in RunAsync
await context.CallActivityAsync(nameof(SomeActivity), null);
```

Workflow code must execute on the workflow dispatch thread. Creating work on other threads bypasses the replay mechanism.

## Forbidden: `HttpClient` / Network I/O in Workflow Code

```csharp
// BAD — network calls in workflow code are non-deterministic and non-durable
public override async Task<string> RunAsync(WorkflowContext context, string url)
{
    using var client = new HttpClient();
    var result = await client.GetStringAsync(url); // NON-DETERMINISTIC
    return result;
}

// GOOD — delegate I/O to an activity
public override async Task<string> RunAsync(WorkflowContext context, string url)
{
    return await context.CallActivityAsync<string>(nameof(FetchUrlActivity), url);
}
```

## Forbidden: LINQ with External Side Effects

```csharp
// BAD — SelectMany calling an activity (non-workflow task) inside LINQ
var tasks = items.Select(item => SomeExternalCall(item)).ToList();
// Don't use .ToList() to eagerly evaluate LINQ with external calls

// GOOD — explicitly build the task list
var tasks = new List<Task<string>>();
foreach (var item in items)
{
    tasks.Add(context.CallActivityAsync<string>(nameof(ProcessActivity), item));
}
var results = await Task.WhenAll(tasks);
```

LINQ uses deferred execution. Mixing LINQ with workflow task creation can produce tasks in unexpected orders or trigger non-workflow side effects mid-replay.

## Forbidden: Mutable Instance Fields in Workflow Classes

```csharp
// BAD — fields mutated across awaits are not replay-safe
internal sealed class BadWorkflow : Workflow<string, string>
{
    private int _counter = 0; // WRONG: shared state across replays

    public override async Task<string> RunAsync(WorkflowContext context, string input)
    {
        _counter++;  // This increments on every replay, not just the first run
        await context.CallActivityAsync(nameof(SomeActivity), _counter);
        return "done";
    }
}

// GOOD — keep state in local variables inside RunAsync
internal sealed class GoodWorkflow : Workflow<string, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, string input)
    {
        var counter = 0;
        counter++;
        await context.CallActivityAsync(nameof(SomeActivity), counter);
        return "done";
    }
}
```

Workflow instances are re-created on replay. Instance fields do not survive across restarts; local variables inside `RunAsync` are correctly rebuilt by replay.

## Safe: `context.IsReplaying` for Logging

```csharp
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    // Use CreateReplaySafeLogger to automatically suppress duplicate log lines
    var logger = context.CreateReplaySafeLogger<MyWorkflow>();
    logger.LogInformation("Processing {Input}", input); // Only logs on first execution

    // Or gate manually
    if (!context.IsReplaying)
    {
        Console.WriteLine($"Processing {input}"); // Suppressed during replay
    }

    return await context.CallActivityAsync<string>(nameof(ProcessActivity), input);
}
```

## Safe: `Task.WhenAll` for Parallel Activities

```csharp
// GOOD — Task.WhenAll with workflow tasks is replay-safe
var tasks = new List<Task<int>>();
foreach (var item in items)
{
    tasks.Add(context.CallActivityAsync<int>(nameof(ProcessActivity), item));
}
var results = await Task.WhenAll(tasks);
```

## Best Practices

1. Treat `RunAsync` as pure orchestration — no I/O, no randomness, no clock
2. All non-deterministic work belongs in activities
3. Use `context.CurrentUtcDateTime` instead of `DateTime.UtcNow`
4. Use `context.NewGuid()` instead of `Guid.NewGuid()`
5. Use `context.CreateReplaySafeLogger<T>()` for logging
6. Build task lists explicitly; avoid LINQ for workflow task creation
7. Keep all workflow state in local variables inside `RunAsync`
