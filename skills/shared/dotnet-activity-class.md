# Activity Class

An activity class inherits from `WorkflowActivity<TInput, TOutput>` and overrides the `RunAsync` method. Activities contain the actual business logic. Use record types from the `Models` folder for input and output. Activity class names should have an `Activity` suffix.

```csharp
using Dapr.Workflow;
using <ProjectNamespace>.Models;

namespace <ProjectNamespace>.Activities;

internal sealed partial class MyActivity(ILogger<MyActivity> logger) : WorkflowActivity<ActivityInput, ActivityOutput>
{
    public override Task<ActivityOutput> RunAsync(WorkflowActivityContext context, ActivityInput input)
    {
        LogInput(logger, input.Data);

        // TODO: implement actual functionality

        return Task.FromResult(new ActivityOutput($"Processed: {input.Data}"));
    }

    [LoggerMessage(LogLevel.Information, "MyActivity: {Data}")]
    static partial void LogInput(ILogger logger, string Data);
}
```

### Key points

- The first generic type parameter (`TInput`) is the activity input type (e.g., `ActivityInput`).
- The second generic type parameter (`TOutput`) is the activity output type (e.g., `ActivityOutput`).
- The `RunAsync` method receives a `WorkflowActivityContext` and the input.
- Activities should be `internal sealed`.
- Place activity classes in an `Activities` folder/namespace for organization.
- If the activity method body is synchronous, return `Task.FromResult()` instead of marking the method `async`.
- Activities are where non-deterministic and I/O operations should be performed (HTTP calls, database queries, file access, etc.).
- If the user has described the desired behavior, implement it inside the `RunAsync` method. If the exact functionality is unclear, add a `// TODO: implement actual functionality` statement inside the `RunAsync` method.
- In `[LoggerMessage]` attributes, use a **plain string** (not `$"..."`) for the message template. The `{ParameterName}` holes are matched by the source generator to the method parameter names. Using `$"..."` with non-constant expressions like method parameter names causes `CS0103` compile errors because those names are not in scope at the class-body level where the attribute is evaluated.