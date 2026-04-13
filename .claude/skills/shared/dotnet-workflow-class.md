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

#### External system interaction (human-in-the-loop)

Pause a workflow until an external event is raised (e.g., a human approval) and handle the timeout path via `TaskCanceledException`:

```csharp
using Microsoft.Extensions.Logging;
using Dapr.Workflow;
using <ProjectNamespace>.Activities;
using <ProjectNamespace>.Models;

namespace <ProjectNamespace>;

internal sealed class ApprovalWorkflow : Workflow<Order, string>
{
    public const string ApprovalEventName = "approval-event";

    public override async Task<string> RunAsync(WorkflowContext context, Order order)
    {
        var logger = context.CreateReplaySafeLogger<ApprovalWorkflow>();
        var approvalStatus = new ApprovalStatus(order.Id, true);
        string notificationMessage;

        if (order.TotalPrice > 250)
        {
            try
            {
                approvalStatus = await context.WaitForExternalEventAsync<ApprovalStatus>(
                    eventName: ApprovalEventName,
                    timeout: TimeSpan.FromSeconds(120));
            }
            catch (TaskCanceledException)
            {
                notificationMessage = $"Approval request for order {order.Id} timed out.";
                LogApprovalTimedOut(logger, order.Id);
                await context.CallActivityAsync(
                    nameof(SendNotification),
                    notificationMessage);
                return notificationMessage;
            }
        }

        if (approvalStatus.IsApproved)
        {
            await context.CallActivityAsync(
                nameof(ProcessOrder),
                order);
        }

        notificationMessage = approvalStatus.IsApproved
            ? $"Order {order.Id} has been approved."
            : $"Order {order.Id} has been rejected.";
        await context.CallActivityAsync(
            nameof(SendNotification),
            notificationMessage);

        return notificationMessage;
    }

    [LoggerMessage(LogLevel.Warning, "Approval for order {Id} timed out")]
    static partial void LogApprovalTimedOut(ILogger logger, string Id);
}
```

##### Key points

- Use `context.WaitForExternalEventAsync<T>(eventName, timeout)` to pause the workflow until an event is raised or the timeout elapses.
- The timeout path surfaces as a `TaskCanceledException` — catch it to run a fallback branch (notification, compensation, etc.).
- Event names should be declared as constants and referenced by both the workflow and the code that raises the event (via `DaprWorkflowClient.RaiseEventAsync`).
- A workflow can wait for multiple events by calling `WaitForExternalEventAsync` multiple times or combining with `Task.WhenAny`.

#### Saga / compensation

Chain activities where a failure in a later step triggers a compensating activity to undo earlier successful steps. On failure the workflow logs the error, runs the compensation, and returns a failure result instead of rethrowing:

```csharp
using Microsoft.Extensions.Logging;
using Dapr.Workflow;
using <ProjectNamespace>.Activities;
using <ProjectNamespace>.Models;

namespace <ProjectNamespace>;

internal sealed class OrderSagaWorkflow : Workflow<OrderInput, OrderResult>
{
    public override async Task<OrderResult> RunAsync(WorkflowContext context, OrderInput input)
    {
        var logger = context.CreateReplaySafeLogger<OrderSagaWorkflow>();

        var reservation = await context.CallActivityAsync<ReservationResult>(
            nameof(ReserveItemActivity),
            input);

        try
        {
            var payment = await context.CallActivityAsync<PaymentResult>(
                nameof(PayItemActivity),
                reservation);

            return new OrderResult(
                IsSuccess: true,
                Message: $"Order {input.OrderId} completed. Payment: {payment.TransactionId}.");
        }
        catch (Exception ex)
        {
            LogPaymentFailed(logger, input.OrderId, ex.Message);

            await context.CallActivityAsync(
                nameof(UndoReserveItemActivity),
                reservation);

            return new OrderResult(
                IsSuccess: false,
                Message: $"Order {input.OrderId} failed during payment and the reservation was released.");
        }
    }

    [LoggerMessage(LogLevel.Error, "Payment failed for order {Id}: {Reason}")]
    static partial void LogPaymentFailed(ILogger logger, string Id, string Reason);
}
```

##### Key points

- Each forward step should have a dedicated compensating activity (e.g., `ReserveItemActivity` ↔ `UndoReserveItemActivity`).
- Compensations should run in reverse order of the successful forward steps.
- Do not rethrow after compensation — log the failure and return a typed result (e.g., `OrderResult` with an `IsSuccess` flag) so the workflow instance completes cleanly and callers can react to the outcome.
- Compensation activities must be idempotent; the workflow runtime may replay them.
- Workflow determinism rules still apply — perform all I/O in activities, never in the workflow body.
