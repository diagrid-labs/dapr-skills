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
  builder.Services.AddDaprWorkflow(options =>
  {
      options.RegisterWorkflow<OrderProcessingWorkflow>();
      options.RegisterActivity<ProcessPaymentActivity>();
  });
  
  // Configure JSON options globally if needed
  builder.Services.Configure<JsonOptions>(options =>
  {
      options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
      options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
      options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
  });
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
  