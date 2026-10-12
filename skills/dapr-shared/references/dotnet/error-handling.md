# .NET Workflow Error Handling

## Overview

Activity and child workflow failures surface in workflow code as `WorkflowTaskFailedException`. Workflow code can catch this exception to inspect failure details, apply compensation, or re-raise to fail the workflow. Retry policies are configured per activity or child workflow call via `WorkflowTaskOptions`.

## WorkflowTaskFailedException

When an activity throws an unhandled exception, the workflow receives a `WorkflowTaskFailedException`:

```csharp
using Dapr.Workflow;

public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    try
    {
        return await context.CallActivityAsync<string>(nameof(RiskyActivity), input);
    }
    catch (WorkflowTaskFailedException ex)
    {
        // ex.Message — summary of the failure
        // ex.FailureDetails.ErrorType — fully qualified exception type name
        // ex.FailureDetails.ErrorMessage — original exception message
        // ex.FailureDetails.StackTrace — stack trace from the activity

        var logger = context.CreateReplaySafeLogger<MyWorkflow>();
        logger.LogWarning("Activity failed: {Type} — {Message}",
            ex.FailureDetails.ErrorType, ex.FailureDetails.ErrorMessage);

        // Check if the failure was caused by a specific exception type
        if (ex.FailureDetails.IsCausedBy<InvalidOperationException>())
        {
            return "handled-invalid-operation";
        }

        throw; // re-raise to fail the workflow
    }
}
```

`IsCausedBy<T>()` resolves `FailureDetails.ErrorType` with `Type.GetType`, but `ErrorType` holds the type's full name without the assembly name. The lookup therefore only succeeds for exception types defined in `System.Private.CoreLib` (e.g. `ArgumentException`, `InvalidOperationException`, `TimeoutException`) or in `Dapr.Workflow.Abstractions`. For any other type — your own exception classes, or framework types such as `HttpRequestException` that live in other assemblies — `IsCausedBy<T>()` always returns `false`. Compare the type name instead:

```csharp
catch (WorkflowTaskFailedException ex)
    when (ex.FailureDetails.ErrorType == typeof(PaymentDeclinedException).FullName)
{
    // handle the custom exception
}
```

## Retry Policies

Retry policies are attached to individual activity calls via `WorkflowTaskOptions`:

```csharp
using Dapr.Workflow;

public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    var retryPolicy = new WorkflowRetryPolicy(
        maxNumberOfAttempts: 5,
        firstRetryInterval: TimeSpan.FromSeconds(5),
        backoffCoefficient: 2.0,           // exponential backoff
        maxRetryInterval: TimeSpan.FromMinutes(2),
        retryTimeout: TimeSpan.FromMinutes(10));

    var options = new WorkflowTaskOptions(RetryPolicy: retryPolicy);

    return await context.CallActivityAsync<string>(
        nameof(NetworkCallActivity), input, options);
}
```

**WorkflowRetryPolicy parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `maxNumberOfAttempts` | Maximum total attempts (must be >= 1) | required |
| `firstRetryInterval` | Delay before first retry | required |
| `backoffCoefficient` | Exponential multiplier per retry (>= 1.0) | `1.0` (constant interval, no back-off) |
| `maxRetryInterval` | Cap on delay between retries | none (uncapped) |
| `retryTimeout` | Overall deadline for all retries | infinite |

The constructor throws `ArgumentOutOfRangeException` when `maxNumberOfAttempts <= 0`, `firstRetryInterval <= TimeSpan.Zero`, `backoffCoefficient < 1.0`, `maxRetryInterval < firstRetryInterval`, or `retryTimeout < firstRetryInterval`. When `maxRetryInterval` is omitted, 1 hour is used only for that validation check; the delay itself is not capped.

## Retry for Child Workflows

Use `ChildWorkflowTaskOptions` to set retry policy on child workflow calls:

```csharp
var retryPolicy = new WorkflowRetryPolicy(
    maxNumberOfAttempts: 3,
    firstRetryInterval: TimeSpan.FromSeconds(10));

var childOptions = new ChildWorkflowTaskOptions(
    InstanceId: $"child-{context.InstanceId}",
    RetryPolicy: retryPolicy);

var result = await context.CallChildWorkflowAsync<string>(
    nameof(ChildWorkflow), input, childOptions);
```

## Non-Retryable Errors

`WorkflowRetryPolicy` has no exception filter: when a retry policy is set, every activity failure is retried until the attempts or the retry timeout are exhausted, regardless of the exception type. To treat some failures as permanent, use one of these approaches:

- Call the activity **without** a retry policy and inspect the failure in the workflow (shown below). If the failure is transient, retry manually with `context.CreateTimer(...)` followed by another `CallActivityAsync`.
- Have the activity **return** a result value for permanent failures (e.g. `ValidationResult(IsValid: false, Reason: ...)`) instead of throwing, and only throw for transient failures that the retry policy should handle.

The example below calls the activity without a retry policy and uses `IsCausedBy<T>()` (which works here because `ArgumentException` is a `System.Private.CoreLib` type) to detect the permanent failure:

```csharp
// Activity — throw a recognizable exception for permanent failures
internal sealed class ValidateInputActivity : WorkflowActivity<string, bool>
{
    public override Task<bool> RunAsync(WorkflowActivityContext context, string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            // ArgumentException signals a permanent, non-retryable failure
            throw new ArgumentException("Input cannot be empty", nameof(input));
        }
        return Task.FromResult(true);
    }
}

// Workflow — check failure type and skip retry
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    // No retry policy — default behavior with no retries
    try
    {
        await context.CallActivityAsync(nameof(ValidateInputActivity), input);
    }
    catch (WorkflowTaskFailedException ex) when (ex.FailureDetails.IsCausedBy<ArgumentException>())
    {
        // Permanent validation failure — do not retry
        return "invalid-input";
    }

    return await context.CallActivityAsync<string>(nameof(ProcessActivity), input);
}
```

## Workflow-Level Failure

Throwing an unhandled exception from `RunAsync` fails the workflow instance:

```csharp
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    if (string.IsNullOrEmpty(input))
    {
        // Fails the workflow — visible in GetWorkflowStateAsync as Failed
        throw new ArgumentException("Input is required");
    }

    return await context.CallActivityAsync<string>(nameof(ProcessActivity), input);
}
```

Failed workflows are visible to callers via `WaitForWorkflowCompletionAsync`:

```csharp
var state = await workflowClient.WaitForWorkflowCompletionAsync(instanceId);
if (state.RuntimeStatus == WorkflowRuntimeStatus.Failed)
{
    Console.WriteLine($"Workflow failed: {state.FailureDetails}");
}
```

## Compensation on Failure

Catch `WorkflowTaskFailedException` to run compensations before re-raising. See `references/dotnet/patterns.md` (Saga pattern) for the full compensation stack pattern.

```csharp
public override async Task<string> RunAsync(WorkflowContext context, string input)
{
    string? resourceId = null;
    try
    {
        resourceId = await context.CallActivityAsync<string>(nameof(AllocateActivity), input);
        await context.CallActivityAsync(nameof(UseResourceActivity), resourceId);
        return "done";
    }
    catch (WorkflowTaskFailedException)
    {
        if (resourceId is not null)
        {
            // Best-effort cleanup — swallow compensation failures
            try
            {
                await context.CallActivityAsync(nameof(ReleaseActivity), resourceId);
            }
            catch { /* log and continue */ }
        }
        throw;
    }
}
```

## Best Practices

1. Catch `WorkflowTaskFailedException` — not the original exception type — when handling activity failures in workflow code
2. Use `IsCausedBy<T>()` to distinguish exception types defined in `System.Private.CoreLib`; for custom or other-assembly exception types compare `FailureDetails.ErrorType` with `typeof(T).FullName`
3. Set retry policies only when you have domain-specific reasons; the default (no retry) is appropriate for many cases
4. Use exponential backoff (`backoffCoefficient > 1.0`) for external service calls
5. Design activities to be idempotent so retries are safe
6. Log failure details using `context.CreateReplaySafeLogger<T>()` before re-raising
