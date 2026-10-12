# C#-Specific Instructions

## Language-Specific Guidelines

1. Type System
- Use strong typing with nullable reference types enabled (`<Nullable>enable</Nullable>`)
- Prefer explicit type declarations for clarity, use `var` only when type is obvious
- Use proper generic constraints and variance where appropriate
- Leverage record types for immutable data transfer objects

2. Error Handling
- Use exceptions for exceptional conditions, not control flow
- Create custom exception types that inherit from appropriate base exceptions
- Use structured exception handling with specific catch blocks

3. Naming Conventions
- Use PascalCase for public types, methods, properties, and events
- Use camelCase for private/internal fields, parameters, and local variables
- Use PascalCase for constants and static readonly fields
- Use descriptive names that reflect business purpose, not technical implementation
- **CRITICAL**: Use domain-specific names instead of generic terms like `booleanDecision`, `conditionCheck`

4. Code Organization
- Follow standard .NET solution structure with proper namespace hierarchy
- Use dependency injection patterns consistently
- Implement proper access modifiers (public, internal, private, protected)
- Group related functionality using partial classes when appropriate
- Use file-scoped namespaces for cleaner code

5. Dapr .NET Workflow SDK Specific
- **CRITICAL: System.Text.Json Serialization** - Dapr .NET uses System.Text.Json for all data serialization:
  ```csharp
  // Proper model design with JSON attributes
  public class WorkflowData
  {
      [JsonPropertyName("order_id")]
      public string OrderId { get; set; } = string.Empty;
      
      [JsonPropertyName("status")]
      public string Status { get; set; } = "pending";
      
      [JsonPropertyName("items")]
      public List<OrderItem> Items { get; set; } = new();
      
      [JsonPropertyName("metadata")]
      public Dictionary<string, JsonElement> Metadata { get; set; } = new();
      
      // Use JsonIgnore for properties that shouldn't be serialized
      [JsonIgnore]
      public bool IsProcessing { get; set; }
  }
  ```

- **Workflow Implementation Patterns** - Follow deterministic workflow patterns:
  ```csharp
  public class OrderProcessingWorkflow : Workflow<OrderData, OrderResult>
  {
      public override async Task<OrderResult> RunAsync(WorkflowContext context, OrderData input)
      {
          var logger = context.CreateReplaySafeLogger<OrderProcessingWorkflow>();
          
          // Use context methods for deterministic operations
          var currentTime = context.CurrentUtcDateTime;
          var deadline = currentTime.AddHours(24);
          
          // Call activities for non-deterministic operations
          var paymentResult = await context.CallActivityAsync<PaymentResponse>(
              nameof(ProcessPaymentActivity), 
              new PaymentRequest(input.OrderId, input.TotalAmount));
          
          if (!paymentResult.IsSuccessful)
          {
              return new OrderResult(input.OrderId, "payment_failed", paymentResult.ErrorMessage);
          }
          
          return new OrderResult(input.OrderId, "completed");
      }
  }
  ```

- **Activity Implementation Patterns** - Handle external operations properly:
  ```csharp
  public class ProcessPaymentActivity : WorkflowActivity<PaymentRequest, PaymentResponse>
  {
      private readonly IPaymentService _paymentService;
      
      public ProcessPaymentActivity(IPaymentService paymentService)
      {
          _paymentService = paymentService;
      }
      
      public override async Task<PaymentResponse> RunAsync(
          WorkflowActivityContext context, 
          PaymentRequest input)
      {
          try
          {
              // Activities can perform non-deterministic operations
              var result = await _paymentService.ProcessPaymentAsync(
                  input.OrderId, 
                  input.Amount);
              
              return new PaymentResponse(
                  result.TransactionId, 
                  result.IsSuccessful, 
                  result.ErrorMessage);
          }
          catch (Exception ex)
          {
              return new PaymentResponse(null, false, ex.Message);
          }
      }
  }
  ```

- **Child Workflow Patterns** - Domain-specific orchestration:
  ```csharp
  // Call child workflow with proper data serialization
  var fulfillmentData = new FulfillmentRequest
  {
      OrderId = input.OrderId,
      Items = input.Items.Select(i => new FulfillmentItem
      {
          ProductId = i.ProductId,
          Quantity = i.Quantity,
          WarehouseId = i.PreferredWarehouse
      }).ToList()
  };
  
  var fulfillmentResult = await context.CallChildWorkflowAsync<FulfillmentResult>(
      nameof(FulfillmentWorkflow),
      fulfillmentData,
      new ChildWorkflowTaskOptions 
      { 
          InstanceId = $"fulfillment-{input.OrderId}" 
      });
  ```

6. System.Text.Json Serialization Best Practices
- **C# Serialization-Safe Data Design** - Design data structures for JSON from the start:
  ```csharp
  // ✅ GOOD: JSON-serializable workflow state
  public record OrderWorkflowState
  {
      [JsonPropertyName("order_id")]
      public string OrderId { get; init; } = string.Empty;
      
      [JsonPropertyName("customer")]
      public CustomerData Customer { get; init; } = new();
      
      [JsonPropertyName("line_items")]
      public IReadOnlyList<OrderLineItem> LineItems { get; init; } = Array.Empty<OrderLineItem>();
      
      [JsonPropertyName("processing_flags")]
      public ProcessingFlags Flags { get; init; } = new();
      
      [JsonPropertyName("timestamps")]
      public Dictionary<string, string> Timestamps { get; init; } = new();
      
      // Helper methods for business logic
      public decimal CalculateTotal() => LineItems.Sum(item => item.Amount);
      
      public bool RequiresApproval() => CalculateTotal() > 1000m || Customer.RiskLevel == "high";
  }
  
  // ❌ BAD: Non-serializable data in workflow state
  public class ProblematicWorkflowState
  {
      public HttpClient HttpClient { get; set; }        // ❌ Non-serializable
      public Timer ProcessingTimer { get; set; }        // ❌ Non-serializable
      public Func<bool> ValidationLogic { get; set; }   // ❌ Functions don't serialize
      public DateTime CreatedAt { get; set; }           // ⚠️ Use string instead for consistency
  }
  ```

- **JSON Converter Configuration** - Use proper serialization options:
  ```csharp
  // In Program.cs or Startup.cs
  using Dapr.Workflow.Versioning;

  // As of Dapr 1.18 workflows and activities are auto-registered
  builder.Services.AddDaprWorkflow();
  builder.Services.AddDaprWorkflowVersioning();
  
  // To customize workflow serialization, replace AddDaprWorkflow() above with:
  // builder.Services.AddDaprWorkflowBuilder(configureRuntime: null)
  //     .WithJsonSerializer(new JsonSerializerOptions(JsonSerializerDefaults.Web)
  //     {
  //         IncludeFields = true,
  //         Converters = { new JsonStringEnumConverter() },
  //         DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
  //     });
  // Note: builder.Services.Configure<JsonOptions>(...) only affects HTTP bodies, not workflow payloads.
  ```

- **Custom JSON Converters for Domain Types**:
  ```csharp
  // Custom converter for precise decimal handling
  public class CurrencyConverter : JsonConverter<decimal>
  {
      public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
      {
          if (reader.TokenType == JsonTokenType.String)
          {
              return decimal.Parse(reader.GetString()!, CultureInfo.InvariantCulture);
          }
          return reader.GetDecimal();
      }
      
      public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
      {
          writer.WriteStringValue(value.ToString("F2", CultureInfo.InvariantCulture));
      }
  }
  ```
  

## Reading the IR

Generate the code from the validated IR (`../ir-schema.md`), not from the diagram. Every language reads the IR the same way: follow the "Consuming the IR" table in `../ir-schema.md` for which record becomes which construct. The records are keyed by `__type` (`metadata`, `participant`, `activity`, `gateway`, `start_end_node`, `edge`, `failure_handling`, `data_object`, `unrecognized_item`); use activity / gateway `id`s for function and class names (converted to this language's naming conventions) and `condition_label` / `event_label` values for branch variables and external event names.

SDK calls for each construct in this language:

| IR construct | C# (`Dapr.Workflow`) |
|---|---|
| `activity` task | `await context.CallActivityAsync<TOutput>(nameof(<Activity>), input)` |
| `task_type: "call_activity"` | `await context.CallChildWorkflowAsync<TOutput>(nameof(<Workflow>), input)` |
| Timer (`event_type: "timer"`, ISO 8601 duration) | `await context.CreateTimer(<TimeSpan>)` (use `System.Xml.XmlConvert.ToTimeSpan` to parse ISO 8601 durations) |
| Message / signal wait, `user_task` completion | `await context.WaitForExternalEventAsync<T>("<event name>")` |
| Wait with a timer (one message + one timer) | `await context.WaitForExternalEventAsync<T>("<event name>", <TimeSpan>)`; a `TaskCanceledException` means the timer branch won |
| Event-based gateway with several events, timer boundary | `var winner = await Task.WhenAny(eventTask, timerTask)` (pass a `CancellationTokenSource` token to `CreateTimer` and cancel it when another task wins) |
| Parallel / inclusive split + join | `await Task.WhenAll(taskA, taskB)` |
| `end_error` | `throw` a domain exception |

Activity bodies: when the diagram does not say how an activity works, write a minimal stub that returns a value of the output type and add exactly one `// TODO: implement actual functionality` comment inside the body. No other `TODO` or placeholder comments anywhere (see `../guardrails.md`, "Output hygiene").
