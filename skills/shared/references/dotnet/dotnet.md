# Dapr Workflow .NET SDK Reference

## Overview

The Dapr Workflow .NET SDK provides a class-based model for building durable workflows. Workflows extend `Workflow<TInput, TOutput>` and activities extend `WorkflowActivity<TInput, TOutput>`. All workflow logic runs through the `WorkflowContext` parameter, which provides replay-safe APIs for calling activities, managing timers, and handling external events.

**CRITICAL**: Workflow code is replayed from history on every recovery. Any non-deterministic call (clock, random, I/O) made directly in workflow code will cause divergence. Use `context` APIs and activities instead.

## Add the Package

```bash
dotnet add package Dapr.Workflow
```

The NuGet package ID is `Dapr.Workflow`.

## Workflow Class

Workflows extend `Workflow<TInput, TOutput>` and override `RunAsync`:

```csharp
// Workflows/GreetingWorkflow.cs
using Dapr.Workflow;

internal sealed class GreetingWorkflow : Workflow<string, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, string name)
    {
        // Delegate all I/O to activities
        var greeting = await context.CallActivityAsync<string>(
            nameof(FormatGreetingActivity), name);

        return greeting;
    }
}
```

## Activity Class

Activities extend `WorkflowActivity<TInput, TOutput>` and override `RunAsync`. Activities can perform I/O, make network calls, and access databases — anything that must not appear in workflow code:

```csharp
// Activities/FormatGreetingActivity.cs
using Dapr.Workflow;

internal sealed class FormatGreetingActivity : WorkflowActivity<string, string>
{
    public override Task<string> RunAsync(WorkflowActivityContext context, string name)
    {
        // I/O, HTTP calls, and database access belong here
        return Task.FromResult($"Hello, {name}!");
    }
}
```

## Registration in Program.cs

Register workflows and activities in `Program.cs` using `AddDaprWorkflow`. Every workflow and activity class must be registered — unregistered types will fail at runtime:

```csharp
// Program.cs
using Dapr.Workflow;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<GreetingWorkflow>();
    options.RegisterActivity<FormatGreetingActivity>();
});

var app = builder.Build();
app.Run();
```

## Starting a Workflow (DaprWorkflowClient)

Inject `DaprWorkflowClient` to schedule and manage workflow instances:

```csharp
// Controllers/WorkflowController.cs
using Dapr.Workflow;

[ApiController]
[Route("[controller]")]
public class WorkflowController : ControllerBase
{
    private readonly DaprWorkflowClient _workflowClient;

    public WorkflowController(DaprWorkflowClient workflowClient)
    {
        _workflowClient = workflowClient;
    }

    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] string name)
    {
        var instanceId = Guid.NewGuid().ToString();

        await _workflowClient.ScheduleNewWorkflowAsync(
            name: nameof(GreetingWorkflow),
            instanceId: instanceId,
            input: name);

        // Wait for the workflow to complete (optional — omit for fire-and-forget)
        var state = await _workflowClient.WaitForWorkflowCompletionAsync(instanceId);

        return Ok(new { instanceId, status = state.RuntimeStatus.ToString() });
    }
}
```

## Console App Pattern

For console apps or background services, use `Host.CreateDefaultBuilder`:

```csharp
// Program.cs (console)
using Dapr.Workflow;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateDefaultBuilder(args).ConfigureServices(services =>
{
    services.AddDaprWorkflow(options =>
    {
        options.RegisterWorkflow<GreetingWorkflow>();
        options.RegisterActivity<FormatGreetingActivity>();
    });
});

using var host = builder.Build();
host.Start();

var workflowClient = host.Services.GetRequiredService<DaprWorkflowClient>();
var instanceId = Guid.NewGuid().ToString();

await workflowClient.ScheduleNewWorkflowAsync(
    name: nameof(GreetingWorkflow),
    instanceId: instanceId,
    input: "World");

var state = await workflowClient.WaitForWorkflowCompletionAsync(instanceId);
Console.WriteLine($"Result: {state.ReadOutputAs<string>()}");
```

## Running the App

```bash
dapr run --app-id myapp -- dotnet run
```

## Key Concepts

### WorkflowContext
The `context` parameter passed to `RunAsync` is the workflow's interface to the Dapr runtime:

| Method | Purpose |
|--------|---------|
| `CallActivityAsync<T>(name, input, options)` | Execute an activity and await its result |
| `CreateTimer(delay)` | Durable timer — survives restarts |
| `WaitForExternalEventAsync<T>(eventName, timeout)` | Block until an external event arrives |
| `ContinueAsNew(newInput)` | Restart the workflow with fresh history |
| `CallChildWorkflowAsync<T>(name, input, options)` | Run a sub-workflow |
| `CurrentUtcDateTime` | Replay-safe replacement for `DateTime.UtcNow` |
| `NewGuid()` | Replay-safe replacement for `Guid.NewGuid()` |
| `IsReplaying` | `true` when replaying history; gate log statements here |
| `CreateReplaySafeLogger<T>()` | Logger that only writes when not replaying |
| `SetCustomStatus(obj)` | Set observable status visible via GetWorkflowStateAsync |

### DaprWorkflowClient
Used outside workflow code to manage workflow instances:

| Method | Purpose |
|--------|---------|
| `ScheduleNewWorkflowAsync(name, instanceId, input)` | Start a new instance |
| `GetWorkflowStateAsync(instanceId)` | Read current state |
| `WaitForWorkflowStartAsync(instanceId)` | Block until running |
| `WaitForWorkflowCompletionAsync(instanceId)` | Block until terminal state |
| `RaiseEventAsync(instanceId, eventName, payload)` | Send external event |
| `TerminateWorkflowAsync(instanceId)` | Force-terminate |
| `SuspendWorkflowAsync(instanceId)` / `ResumeWorkflowAsync(instanceId)` | Pause/unpause |
| `PurgeInstanceAsync(instanceId)` | Delete completed instance |

## Common Pitfalls

1. **Non-deterministic code in workflows** — use `context.CurrentUtcDateTime`, `context.NewGuid()`, and activities instead
2. **Forgetting to register a workflow or activity** — runtime will fail if a type is not registered
3. **Using `ILogger` directly in workflows** — use `context.CreateReplaySafeLogger<T>()` to suppress replay noise
4. **Calling `context` APIs from wrong thread** — all `await` calls in `RunAsync` must stay on the workflow thread

## Additional References

- **`references/dotnet/determinism.md`** — non-determinism rules specific to .NET
- **`references/dotnet/patterns.md`** — all six workflow patterns with full C# code
- **`references/dotnet/error-handling.md`** — WorkflowTaskFailedException, retry policies
- **`references/dotnet/data-handling.md`** — JSON serialization, custom types
- **`references/dotnet/testing.md`** — xUnit, Moq, integration testing
- **`references/dotnet/gotchas.md`** — .NET-specific anti-patterns
- **`references/core/determinism.md`** — why determinism matters (language-agnostic)
