# .NET Workflow Testing

## Overview

Dapr Workflow .NET tests use **xUnit** as the test framework and **Moq** (or **NSubstitute**) to mock activity dependencies. Because `WorkflowContext` and `WorkflowActivityContext` are abstract classes, they can be mocked directly using Moq.

There is no built-in time-skipping test environment in the Dapr .NET SDK (unlike Temporal's `TestWorkflowEnvironment`). Timer testing requires either integration tests with a real Dapr sidecar or unit tests that mock `CreateTimer` on the context.

## Unit Testing Activities

Activities are the easiest to test — they are plain classes with no special runtime dependencies:

```csharp
// Activities/FormatGreetingActivity.cs
internal sealed class FormatGreetingActivity : WorkflowActivity<string, string>
{
    public override Task<string> RunAsync(WorkflowActivityContext context, string name)
        => Task.FromResult($"Hello, {name}!");
}

// Tests/FormatGreetingActivityTests.cs
using Dapr.Workflow;
using Moq;
using Xunit;

public class FormatGreetingActivityTests
{
    [Fact]
    public async Task RunAsync_ReturnsFormattedGreeting()
    {
        var activity = new FormatGreetingActivity();
        var contextMock = new Mock<WorkflowActivityContext>();
        contextMock.Setup(c => c.InstanceId).Returns("test-instance");

        var result = await activity.RunAsync(contextMock.Object, "World");

        Assert.Equal("Hello, World!", result);
    }

    [Theory]
    [InlineData("Alice", "Hello, Alice!")]
    [InlineData("Bob", "Hello, Bob!")]
    public async Task RunAsync_FormatsVariousNames(string name, string expected)
    {
        var activity = new FormatGreetingActivity();
        var contextMock = new Mock<WorkflowActivityContext>();

        var result = await activity.RunAsync(contextMock.Object, name);

        Assert.Equal(expected, result);
    }
}
```

## Unit Testing Workflow Logic

Mock `WorkflowContext` to test workflow branching logic in isolation:

```csharp
// Tests/OrderWorkflowTests.cs
using Dapr.Workflow;
using Moq;
using Xunit;

public class OrderWorkflowTests
{
    [Fact]
    public async Task RunAsync_InsufficientInventory_ReturnsFailed()
    {
        var workflow = new OrderWorkflow();
        var contextMock = new Mock<WorkflowContext>();
        var loggerMock = new Mock<Microsoft.Extensions.Logging.ILogger>();

        // Set up replay-safe logger
        contextMock.Setup(c => c.CreateReplaySafeLogger<OrderWorkflow>())
            .Returns(loggerMock.Object);

        // Mock inventory check to return insufficient
        contextMock
            .Setup(c => c.CallActivityAsync<InventoryResult>(
                nameof(VerifyInventoryActivity),
                It.IsAny<object>(),
                It.IsAny<WorkflowTaskOptions>()))
            .ReturnsAsync(new InventoryResult(Success: false));

        var input = new OrderInput("order-1", "customer-1", 100m);
        var result = await workflow.RunAsync(contextMock.Object, input);

        Assert.False(result.Success);
    }

    [Fact]
    public async Task RunAsync_SufficientInventory_ProcessesPayment()
    {
        var workflow = new OrderWorkflow();
        var contextMock = new Mock<WorkflowContext>();
        var loggerMock = new Mock<Microsoft.Extensions.Logging.ILogger>();

        contextMock.Setup(c => c.CreateReplaySafeLogger<OrderWorkflow>())
            .Returns(loggerMock.Object);

        // Inventory is available
        contextMock
            .Setup(c => c.CallActivityAsync<InventoryResult>(
                nameof(VerifyInventoryActivity),
                It.IsAny<object>(),
                It.IsAny<WorkflowTaskOptions>()))
            .ReturnsAsync(new InventoryResult(Success: true));

        // Payment succeeds
        contextMock
            .Setup(c => c.CallActivityAsync<string>(
                nameof(ProcessPaymentActivity),
                It.IsAny<object>(),
                It.IsAny<WorkflowTaskOptions>()))
            .ReturnsAsync("PAY-001");

        var input = new OrderInput("order-1", "customer-1", 100m);
        var result = await workflow.RunAsync(contextMock.Object, input);

        Assert.True(result.Success);

        // Verify payment activity was called exactly once
        contextMock.Verify(
            c => c.CallActivityAsync<string>(nameof(ProcessPaymentActivity), It.IsAny<object>(), null),
            Times.Once);
    }
}
```

## Testing with NSubstitute

NSubstitute is an alternative to Moq with a cleaner API:

```csharp
using NSubstitute;
using Dapr.Workflow;
using Xunit;

public class GreetingWorkflowTests
{
    [Fact]
    public async Task RunAsync_CallsGreetActivity()
    {
        var context = Substitute.For<WorkflowContext>();
        context.CallActivityAsync<string>(
            nameof(FormatGreetingActivity),
            "World",
            default)
            .Returns(Task.FromResult("Hello, World!"));

        var workflow = new GreetingWorkflow();
        var result = await workflow.RunAsync(context, "World");

        Assert.Equal("Hello, World!", result);
    }
}
```

## Testing Error Handling

Test that workflow code handles activity failures correctly:

```csharp
[Fact]
public async Task RunAsync_ActivityFails_ReturnsError()
{
    var workflow = new OrderWorkflow();
    var contextMock = new Mock<WorkflowContext>();
    var loggerMock = new Mock<Microsoft.Extensions.Logging.ILogger>();

    contextMock.Setup(c => c.CreateReplaySafeLogger<OrderWorkflow>())
        .Returns(loggerMock.Object);

    // Simulate activity failure
    var failureDetails = new WorkflowTaskFailureDetails(
        errorType: "System.Net.Http.HttpRequestException",
        errorMessage: "Connection refused");

    contextMock
        .Setup(c => c.CallActivityAsync<InventoryResult>(
            nameof(VerifyInventoryActivity),
            It.IsAny<object>(),
            It.IsAny<WorkflowTaskOptions>()))
        .ThrowsAsync(new WorkflowTaskFailedException("Activity failed", failureDetails));

    var input = new OrderInput("order-1", "customer-1", 100m);
    var result = await workflow.RunAsync(contextMock.Object, input);

    Assert.False(result.Success);
}
```

## Integration Testing with Dapr Sidecar

For end-to-end tests, use the Dapr `Testcontainers` package or run a local Dapr sidecar. The SDK provides `WorkflowHarness` in `Dapr.Testcontainers`:

```csharp
// Integration test — requires Docker and Dapr CLI
// Add package: Dapr.Testcontainers

public class WorkflowIntegrationTests : IAsyncLifetime
{
    private WorkflowHarness _harness = null!;

    public async Task InitializeAsync()
    {
        _harness = new WorkflowHarness();
        await _harness.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await _harness.DisposeAsync();
    }

    [Fact]
    public async Task GreetingWorkflow_CompletesSuccessfully()
    {
        var client = _harness.GetWorkflowClient();

        var instanceId = await client.ScheduleNewWorkflowAsync(
            name: nameof(GreetingWorkflow),
            input: "World");

        var state = await client.WaitForWorkflowCompletionAsync(
            instanceId,
            cancellation: new CancellationTokenSource(TimeSpan.FromSeconds(30)).Token);

        Assert.Equal(WorkflowRuntimeStatus.Completed, state.RuntimeStatus);
        Assert.Equal("Hello, World!", state.ReadOutputAs<string>());
    }
}
```

## Replay Testing (Gap)

**The Dapr .NET SDK does not provide a built-in replay testing mechanism** comparable to Temporal's `Worker.runReplayHistory()`. There is no API to feed a workflow history file and verify determinism.

To verify that code changes are safe for in-flight workflows:
- Drain all running instances before deploying breaking changes
- Use `IsPatched(patchName)` versioning guards for safe incremental rollout (see `references/core/versioning.md`)
- Consider manual verification by exporting and re-running a representative history against the new code in an integration environment

## Best Practices

1. Unit test activities in isolation — they have no special runtime dependencies
2. Unit test workflow branching logic by mocking `WorkflowContext`
3. Use Moq's `Verify` to assert that activities are called the expected number of times
4. Use integration tests for timer behavior, external events, and end-to-end flows
5. Keep test helper methods for building mock context setups to reduce duplication
6. Name test methods: `MethodName_Condition_ExpectedBehavior`
