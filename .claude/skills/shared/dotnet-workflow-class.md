# Workflow Class

A workflow class inherits from `Workflow<TInput, TOutput>` and overrides the `RunAsync` method. The workflow orchestrates one or more activities by calling `context.CallActivityAsync`. Use record types from the `Models` folder for input and output. Workflow class names should have a `Workflow` suffix.

```csharp
using Microsoft.Extensions.Logging;
using Dapr.Workflow;
using <ProjectNamespace>.Activities;
using <ProjectNamespace>.Models;

namespace <ProjectNamespace>;

internal sealed class MyWorkflow : Workflow<WorkflowInput, WorkflowOutput>
{
    public override async Task<WorkflowOutput> RunAsync(WorkflowContext context, WorkflowInput input)
    {
        var logger = context.CreateReplaySafeLogger<MyWorkflow>();
        LogStart(logger, context.InstanceId);
        
        var activityInput = new ActivityInput(input.Message);
        var activityOutput = await context.CallActivityAsync<ActivityOutput>(
            nameof(MyActivity),
            activityInput);

        return new WorkflowOutput(activityOutput.ProcessedData);
    }

    [LoggerMessage(LogLevel.Information, "Starting workflow with ID: {Id}")]
    static partial void LogStart(ILogger logger, string Id);
}
```

### Key points

- The first generic type parameter (`TInput`) is the workflow input type (e.g., `WorkflowInput`).
- The second generic type parameter (`TOutput`) is the workflow output type (e.g., `WorkflowOutput`).
- Use `context.CallActivityAsync<TOutput>(activityName, input)` to call an activity.
- Use `nameof()` to reference activity names to avoid magic strings.
- Place workflow classes in a `Workflows` folder/namespace for organization.
- Use the `CreateReplaySafeLogger`method on the workflow context to create an ILogger that is safe to use in workflows.
- Activities can be chained by passing the output of one activity as the input to the next.
- Map between workflow and activity model types as needed.
- The workflow class should be `internal sealed`.

### Workflow determinism

Workflow code must be deterministic because the runtime replays the `RunAsync` method multiple times to ensure workflow durability. Avoid the following inside a workflow:

- `DateTime.Now` or `DateTime.UtcNow` — use `context.CurrentUtcDateTime` instead.
- `Guid.NewGuid()` — use `context.NewGuid()` instead.
- Random number generation.
- Direct I/O operations (HTTP calls, file access, database queries) — perform these in activities instead.
- `Thread.Sleep` or `Task.Delay` — use `context.CreateTimer()` instead.
- while loops - use context.ContinueAsNew(<TInput>) instead.

### Workflow patterns

#### Task chaining

Chain multiple activities by passing each result to the next activity:

```csharp
using Dapr.Workflow;

namespace <ProjectNamespace>;

internal sealed class ChainingWorkflow : Workflow<string, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, string input)
    {
        var result1 = await context.CallActivityAsync<string>(
            nameof(Step1Activity),
            input);
        var result2 = await context.CallActivityAsync<string>(
            nameof(Step2Activity),
            result1);
        var result3 = await context.CallActivityAsync<string>(
            nameof(Step3Activity),
            result2);

        return result3;
    }
}
```

#### Fan-out/fan-in

Execute multiple activities in parallel and wait for all of them to complete:

```csharp
using Dapr.Workflow;

namespace <ProjectNamespace>;

internal sealed class FanOutFanInWorkflow : Workflow<string[], string[]>
{
    public override async Task<string[]> RunAsync(WorkflowContext context, string[] inputs)
    {
        var tasks = inputs.Select(input =>
            context.CallActivityAsync<string>(nameof(ProcessActivity), input));

        var results = await Task.WhenAll(tasks);

        return results;
    }
}
```

#### Child-workflows

Call another workflow from within a workflow using `context.CallChildWorkflowAsync`:

```csharp
using Dapr.Workflow;

namespace <ProjectNamespace>;

internal sealed class ParentWorkflow : Workflow<string, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, string input)
    {
        var result = await context.CallChildWorkflowAsync<string>(
            nameof(ChildWorkflow),
            input);

        return result;
    }
}
```

#### Monitor pattern

```csharp
using Dapr.Workflow;

namespace <ProjectNamespace>;

internal sealed class MonitorWorkflow : Workflow<int, string>
{
    public override async Task<string> RunAsync(WorkflowContext context, int counter)
    {
        var status = await context.CallActivityAsync<Status>(
            nameof(CheckStatus),
            counter);

        if (!status.IsReady)
        {
            await context.CreateTimer(TimeSpan.FromSeconds(30));
            counter++;
            context.ContinueAsNew(counter);
        }

        return $"Status is healthy after checking {counter} times.";
    }
}
```
