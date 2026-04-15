# .NET Workflow Patterns

## Pattern 1: Activity Chaining

Execute activities in sequence, passing outputs from one into the next.

```csharp
// Workflows/OrderWorkflow.cs
using Dapr.Workflow;

internal sealed class OrderWorkflow : Workflow<OrderInput, OrderResult>
{
    public override async Task<OrderResult> RunAsync(WorkflowContext context, OrderInput order)
    {
        // Step 1: Validate the order
        var validated = await context.CallActivityAsync<bool>(
            nameof(ValidateOrderActivity), order);

        if (!validated)
        {
            return new OrderResult(Success: false, Message: "Validation failed");
        }

        // Step 2: Process payment — uses output from step 1
        var paymentId = await context.CallActivityAsync<string>(
            nameof(ProcessPaymentActivity), order);

        // Step 3: Fulfill — uses output from step 2
        var trackingNumber = await context.CallActivityAsync<string>(
            nameof(FulfillOrderActivity), new FulfillInput(order.OrderId, paymentId));

        return new OrderResult(Success: true, TrackingNumber: trackingNumber);
    }
}

// Activities/ValidateOrderActivity.cs
internal sealed class ValidateOrderActivity : WorkflowActivity<OrderInput, bool>
{
    public override Task<bool> RunAsync(WorkflowActivityContext context, OrderInput order)
    {
        var valid = !string.IsNullOrEmpty(order.CustomerId) && order.Amount > 0;
        return Task.FromResult(valid);
    }
}

// Activities/ProcessPaymentActivity.cs
internal sealed class ProcessPaymentActivity : WorkflowActivity<OrderInput, string>
{
    private readonly IPaymentService _payments;

    public ProcessPaymentActivity(IPaymentService payments)
    {
        _payments = payments;
    }

    public override async Task<string> RunAsync(WorkflowActivityContext context, OrderInput order)
    {
        return await _payments.ChargeAsync(order.CustomerId, order.Amount);
    }
}

// Activities/FulfillOrderActivity.cs
internal sealed class FulfillOrderActivity : WorkflowActivity<FulfillInput, string>
{
    public override Task<string> RunAsync(WorkflowActivityContext context, FulfillInput input)
    {
        // Returns a tracking number
        return Task.FromResult($"TRACK-{input.OrderId}-{Guid.NewGuid():N}[..8]");
    }
}

// Program.cs
builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<OrderWorkflow>();
    options.RegisterActivity<ValidateOrderActivity>();
    options.RegisterActivity<ProcessPaymentActivity>();
    options.RegisterActivity<FulfillOrderActivity>();
});
```

---

## Pattern 2: Fan-Out / Fan-In

Execute multiple activities in parallel and collect all results.

```csharp
// Workflows/BatchProcessingWorkflow.cs
using Dapr.Workflow;

internal sealed class BatchProcessingWorkflow : Workflow<string[], BatchResult>
{
    public override async Task<BatchResult> RunAsync(WorkflowContext context, string[] items)
    {
        // Fan out — start all activities without awaiting them individually
        var tasks = new List<Task<ItemResult>>();
        foreach (var item in items)
        {
            tasks.Add(context.CallActivityAsync<ItemResult>(
                nameof(ProcessItemActivity), item));
        }

        // Fan in — wait for all to complete
        var results = await Task.WhenAll(tasks);

        var successCount = results.Count(r => r.Success);
        return new BatchResult(Total: items.Length, Succeeded: successCount);
    }
}

// Activities/ProcessItemActivity.cs
internal sealed class ProcessItemActivity : WorkflowActivity<string, ItemResult>
{
    public override async Task<ItemResult> RunAsync(WorkflowActivityContext context, string item)
    {
        // Simulate processing
        await Task.Delay(10);
        return new ItemResult(Item: item, Success: true);
    }
}

// Models
public record ItemResult(string Item, bool Success);
public record BatchResult(int Total, int Succeeded);

// Program.cs
builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<BatchProcessingWorkflow>();
    options.RegisterActivity<ProcessItemActivity>();
});
```

---

## Pattern 3: Saga with Compensation

Execute a multi-step transaction where each completed step registers a compensating action. If any step fails, run compensations in reverse order.

```csharp
// Workflows/TravelBookingWorkflow.cs
using Dapr.Workflow;

internal sealed class TravelBookingWorkflow : Workflow<TravelRequest, TravelResult>
{
    public override async Task<TravelResult> RunAsync(WorkflowContext context, TravelRequest request)
    {
        var logger = context.CreateReplaySafeLogger<TravelBookingWorkflow>();

        // Compensation stack — populated as steps succeed
        var compensations = new Stack<Func<Task>>();

        try
        {
            // Step 1: Reserve flight
            var flightId = await context.CallActivityAsync<string>(
                nameof(ReserveFlightActivity), request);
            // Register compensation BEFORE proceeding to next step
            compensations.Push(() => context.CallActivityAsync(
                nameof(CancelFlightActivity), flightId));

            // Step 2: Reserve hotel
            var hotelId = await context.CallActivityAsync<string>(
                nameof(ReserveHotelActivity), request);
            compensations.Push(() => context.CallActivityAsync(
                nameof(CancelHotelActivity), hotelId));

            // Step 3: Charge payment
            var paymentId = await context.CallActivityAsync<string>(
                nameof(ChargePaymentActivity), request);
            compensations.Push(() => context.CallActivityAsync(
                nameof(RefundPaymentActivity), paymentId));

            return new TravelResult(Success: true, FlightId: flightId, HotelId: hotelId);
        }
        catch (WorkflowTaskFailedException ex)
        {
            logger.LogWarning("Booking step failed: {Error} — running compensations", ex.Message);

            // Run compensations in reverse order
            while (compensations.TryPop(out var compensate))
            {
                try
                {
                    await compensate();
                }
                catch (Exception compEx)
                {
                    // Log but continue with remaining compensations
                    logger.LogError("Compensation failed: {Error}", compEx.Message);
                }
            }

            return new TravelResult(Success: false, Error: ex.Message);
        }
    }
}

// Activities (stubs showing the pattern)
internal sealed class ReserveFlightActivity : WorkflowActivity<TravelRequest, string>
{
    public override Task<string> RunAsync(WorkflowActivityContext context, TravelRequest request)
        => Task.FromResult($"FLIGHT-{context.InstanceId}");
}

internal sealed class CancelFlightActivity : WorkflowActivity<string, bool>
{
    public override Task<bool> RunAsync(WorkflowActivityContext context, string flightId)
    {
        // Idempotent cancellation
        return Task.FromResult(true);
    }
}

// Program.cs
builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<TravelBookingWorkflow>();
    options.RegisterActivity<ReserveFlightActivity>();
    options.RegisterActivity<ReserveHotelActivity>();
    options.RegisterActivity<ChargePaymentActivity>();
    options.RegisterActivity<CancelFlightActivity>();
    options.RegisterActivity<CancelHotelActivity>();
    options.RegisterActivity<RefundPaymentActivity>();
});
```

**Important:** Compensation activities must be **idempotent** — they may be called more than once due to at-least-once activity execution guarantees.

---

## Pattern 4: Human-in-the-Loop (WaitForExternalEvent)

Pause the workflow at a decision point and wait for an external approval event, with an automatic timeout.

```csharp
// Workflows/ApprovalWorkflow.cs
using Dapr.Workflow;

internal sealed class ApprovalWorkflow : Workflow<ApprovalRequest, ApprovalResult>
{
    public override async Task<ApprovalResult> RunAsync(
        WorkflowContext context, ApprovalRequest request)
    {
        var logger = context.CreateReplaySafeLogger<ApprovalWorkflow>();

        // Notify approver
        await context.CallActivityAsync(nameof(NotifyApproverActivity), request);

        // Wait for approval event with a 24-hour timeout
        ApprovalDecision decision;
        try
        {
            decision = await context.WaitForExternalEventAsync<ApprovalDecision>(
                eventName: "ApprovalDecision",
                timeout: TimeSpan.FromHours(24));
        }
        catch (TaskCanceledException)
        {
            // Timeout elapsed — auto-reject
            logger.LogWarning("Approval timed out for request {Id}", request.RequestId);
            await context.CallActivityAsync(nameof(NotifyTimeoutActivity), request);
            return new ApprovalResult(Approved: false, Reason: "Timed out");
        }

        if (decision.Approved)
        {
            await context.CallActivityAsync(nameof(ExecuteApprovedActionActivity), request);
            return new ApprovalResult(Approved: true, Reason: decision.Comment);
        }
        else
        {
            await context.CallActivityAsync(nameof(NotifyRejectionActivity), request);
            return new ApprovalResult(Approved: false, Reason: decision.Comment);
        }
    }
}

// Send approval from outside the workflow (e.g., from an HTTP controller)
// workflowClient.RaiseEventAsync(instanceId, "ApprovalDecision", new ApprovalDecision(Approved: true, Comment: "LGTM"));

// Activities
internal sealed class NotifyApproverActivity : WorkflowActivity<ApprovalRequest, bool>
{
    public override Task<bool> RunAsync(WorkflowActivityContext context, ApprovalRequest request)
    {
        Console.WriteLine($"Notifying approver for request {request.RequestId}");
        return Task.FromResult(true);
    }
}

// Models
public record ApprovalRequest(string RequestId, string Description, decimal Amount);
public record ApprovalDecision(bool Approved, string Comment);
public record ApprovalResult(bool Approved, string Reason);

// Program.cs
builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<ApprovalWorkflow>();
    options.RegisterActivity<NotifyApproverActivity>();
    options.RegisterActivity<ExecuteApprovedActionActivity>();
    options.RegisterActivity<NotifyRejectionActivity>();
    options.RegisterActivity<NotifyTimeoutActivity>();
});
```

---

## Pattern 5: Eternal Monitoring (ContinueAsNew)

Run indefinitely by periodically checking a condition and restarting the workflow with fresh history to prevent unbounded history growth.

```csharp
// Workflows/MonitorWorkflow.cs
using Dapr.Workflow;

internal sealed class MonitorWorkflow : Workflow<MonitorState, object>
{
    public override async Task<object> RunAsync(WorkflowContext context, MonitorState state)
    {
        var logger = context.CreateReplaySafeLogger<MonitorWorkflow>();

        logger.LogInformation("Monitor cycle {Cycle} for {Resource}", state.Cycle, state.ResourceId);

        // Check current health
        var health = await context.CallActivityAsync<HealthStatus>(
            nameof(CheckHealthActivity), state.ResourceId);

        if (health.IsHealthy)
        {
            logger.LogInformation("Resource {Resource} is healthy", state.ResourceId);
        }
        else
        {
            // Trigger alert on unhealthy status
            await context.CallActivityAsync(nameof(SendAlertActivity),
                new AlertInput(state.ResourceId, health.Details));
        }

        // Wait before next check
        await context.CreateTimer(TimeSpan.FromMinutes(5));

        // Restart with fresh history — prevents unbounded history growth
        context.ContinueAsNew(state with { Cycle = state.Cycle + 1 });

        // Return value is ignored since ContinueAsNew restarts the workflow
        return null!;
    }
}

// Activities
internal sealed class CheckHealthActivity : WorkflowActivity<string, HealthStatus>
{
    private readonly IHealthChecker _checker;

    public CheckHealthActivity(IHealthChecker checker)
    {
        _checker = checker;
    }

    public override async Task<HealthStatus> RunAsync(WorkflowActivityContext context, string resourceId)
    {
        return await _checker.CheckAsync(resourceId);
    }
}

internal sealed class SendAlertActivity : WorkflowActivity<AlertInput, bool>
{
    public override Task<bool> RunAsync(WorkflowActivityContext context, AlertInput input)
    {
        Console.WriteLine($"ALERT: {input.ResourceId} is unhealthy — {input.Details}");
        return Task.FromResult(true);
    }
}

// Models
public record MonitorState(string ResourceId, int Cycle = 0);
public record HealthStatus(bool IsHealthy, string Details);
public record AlertInput(string ResourceId, string Details);

// Program.cs — start the eternal workflow once
builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<MonitorWorkflow>();
    options.RegisterActivity<CheckHealthActivity>();
    options.RegisterActivity<SendAlertActivity>();
});

// Start it (idempotent — use a stable instance ID so it only starts once)
await workflowClient.ScheduleNewWorkflowAsync(
    name: nameof(MonitorWorkflow),
    instanceId: "monitor-resource-123",
    input: new MonitorState("resource-123"));
```

**Note:** After `ContinueAsNew`, return immediately from `RunAsync`. Any code after the call is unreachable in the new execution.

---

## Pattern 6: Sub-Orchestration (Child Workflows)

Decompose a large workflow into child workflows. Each child has its own instance ID, history, and status, which keeps parent history manageable.

```csharp
// Workflows/BatchOrderWorkflow.cs
using Dapr.Workflow;

internal sealed class BatchOrderWorkflow : Workflow<BatchOrderInput, BatchOrderResult>
{
    public override async Task<BatchOrderResult> RunAsync(
        WorkflowContext context, BatchOrderInput batch)
    {
        var childTasks = new List<Task<OrderResult>>();

        // Launch all child workflows in parallel
        foreach (var order in batch.Orders)
        {
            var childOptions = new ChildWorkflowTaskOptions(
                InstanceId: $"order-{order.OrderId}");

            childTasks.Add(context.CallChildWorkflowAsync<OrderResult>(
                workflowName: nameof(SingleOrderWorkflow),
                input: order,
                options: childOptions));
        }

        // Wait for all child workflows to complete
        var results = await Task.WhenAll(childTasks);

        var succeeded = results.Count(r => r.Success);
        return new BatchOrderResult(Total: batch.Orders.Length, Succeeded: succeeded);
    }
}

// Workflows/SingleOrderWorkflow.cs
internal sealed class SingleOrderWorkflow : Workflow<OrderInput, OrderResult>
{
    public override async Task<OrderResult> RunAsync(WorkflowContext context, OrderInput order)
    {
        await context.CallActivityAsync(nameof(ProcessPaymentActivity), order);
        await context.CallActivityAsync(nameof(ShipOrderActivity), order);
        return new OrderResult(Success: true);
    }
}

// Models
public record BatchOrderInput(OrderInput[] Orders);
public record BatchOrderResult(int Total, int Succeeded);
public record OrderInput(string OrderId, string CustomerId, decimal Amount);
public record OrderResult(bool Success, string? Error = null);

// Program.cs
builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<BatchOrderWorkflow>();
    options.RegisterWorkflow<SingleOrderWorkflow>();
    options.RegisterActivity<ProcessPaymentActivity>();
    options.RegisterActivity<ShipOrderActivity>();
});
```

**Note:** When a parent workflow terminates, all its child workflows are also terminated. Child workflow retry policies are set via `ChildWorkflowTaskOptions.RetryPolicy`.
