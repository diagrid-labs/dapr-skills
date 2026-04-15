# .NET Workflow Data Handling

## Overview

The Dapr Workflow .NET SDK serializes all workflow inputs, outputs, and activity parameters using **System.Text.Json** by default. All types passed across workflow boundaries must be JSON-serializable. Dapr stores all serialized data in the workflow history, so payloads must remain small and must not contain sensitive data.

## Default Serializer

The default serializer uses `JsonSerializerDefaults.Web`, which applies:
- Case-insensitive property name matching on deserialization
- `camelCase` property names on serialization

No configuration is needed for typical use cases.

## Input and Output Type Requirements

Workflow and activity inputs/outputs must satisfy the following:

```csharp
// GOOD — plain record type with JSON-serializable properties
public record OrderInput(string OrderId, string CustomerId, decimal Amount);
public record OrderResult(bool Success, string? TrackingNumber = null);

internal sealed class OrderWorkflow : Workflow<OrderInput, OrderResult>
{
    public override async Task<OrderResult> RunAsync(WorkflowContext context, OrderInput order)
    {
        // order is deserialized from JSON on replay
        var result = await context.CallActivityAsync<OrderResult>(
            nameof(ProcessOrderActivity), order);
        return result;
    }
}
```

Types must be:
- Serializable by System.Text.Json (public properties with getters/setters or constructor parameters)
- Not polymorphic without explicit `[JsonDerivedType]` configuration
- Not containing circular references

## Record Types

Record types work well as workflow inputs/outputs because they are immutable by default and serialize cleanly:

```csharp
// Positional records serialize all constructor parameters
public record PaymentRequest(
    string RequestId,
    string CustomerId,
    decimal Amount,
    string Currency = "USD");

// Record structs also work
public readonly record struct InventoryItem(string Name, int Quantity, decimal UnitPrice);
```

## Custom Property Names

Use `[JsonPropertyName]` to control the serialized property name:

```csharp
using System.Text.Json.Serialization;

public class OrderPayload
{
    [JsonPropertyName("order_id")]
    public string OrderId { get; init; } = string.Empty;

    [JsonPropertyName("total_cost")]
    public decimal TotalCost { get; init; }

    [JsonPropertyName("items")]
    public List<LineItem> Items { get; init; } = [];
}
```

## Ignoring Properties

```csharp
using System.Text.Json.Serialization;

public class InternalOrder
{
    public string OrderId { get; init; } = string.Empty;

    [JsonIgnore]
    public string InternalNotes { get; set; } = string.Empty; // Not serialized
}
```

## Nullable and Optional Fields

```csharp
public record WorkflowState(
    string WorkflowId,
    string Status,
    string? ErrorMessage = null,    // null if no error
    DateTime? CompletedAt = null);   // null if not yet complete
```

## Custom Serializer Options

If the default `JsonSerializerDefaults.Web` options are insufficient, configure a custom serializer when registering workflows:

```csharp
using System.Text.Json;
using Dapr.Workflow;

builder.Services.AddDaprWorkflow(options =>
{
    options.RegisterWorkflow<OrderWorkflow>();
    options.RegisterActivity<ProcessOrderActivity>();
});

// Then override the serializer via the builder
builder.Services.AddDaprWorkflowBuilder(
    configureRuntime: options =>
    {
        options.RegisterWorkflow<OrderWorkflow>();
        options.RegisterActivity<ProcessOrderActivity>();
    })
    .WithJsonSerializer(new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    });
```

## Payload Size Considerations

Workflow history is stored durably — every activity input and output is persisted. Exceeding the Dapr state store limits causes workflow failures.

**Guidelines:**
- Keep inputs/outputs under 1 MB per call
- Pass **references** (URLs, IDs, storage keys) for large data — fetch inside the activity
- Avoid embedding binary data directly; use base64 only for small blobs

```csharp
// BAD — large payload embedded in workflow history
public record BadInput(string Id, byte[] LargeDocument); // Could be megabytes

// GOOD — pass a reference; fetch the data in the activity
public record GoodInput(string Id, string DocumentUrl);

internal sealed class ProcessDocumentActivity : WorkflowActivity<GoodInput, string>
{
    public override async Task<string> RunAsync(WorkflowActivityContext context, GoodInput input)
    {
        // Fetch the large data inside the activity (not persisted to history)
        var content = await DownloadAsync(input.DocumentUrl);
        return ProcessContent(content);
    }
}
```

## Sensitive Data

Workflow inputs, outputs, and activity parameters are stored in plain JSON in the Dapr state store.

**Never pass the following in workflow payloads:**
- Passwords or API keys
- PII (names, emails, SSNs) unless your state store is appropriately secured
- Raw financial instrument data (card numbers, CVVs)

Instead, pass references or IDs and resolve them in activities against a secure secrets store.

## Best Practices

1. Use record types for workflow inputs/outputs — they serialize cleanly and are immutable
2. Keep all serializable types in a shared `Models/` folder for discoverability
3. Use `[JsonPropertyName]` when interoperating with external APIs that use different naming conventions
4. Pass references instead of large blobs
5. Never include sensitive data in workflow payloads
6. Confirm types are JSON round-trip safe in unit tests before deploying
