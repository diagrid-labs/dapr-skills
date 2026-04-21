# Java-Specific Instructions

## Language-Specific Guidelines

1. Type System
- Use strong typing for all variables and parameters
- Prefer interfaces over concrete implementations
- Use generics appropriately for type safety
- Avoid raw types

2. Error Handling
- Use checked exceptions for recoverable errors
- Use runtime exceptions for programming errors
- Follow the principle of exception transparency
- Document exceptions in method signatures

3. Naming Conventions
- Use camelCase for variables and methods
- Use PascalCase for classes and interfaces
- Use UPPER_SNAKE_CASE for constants
- Use descriptive names that reflect purpose

4. Code Organization
- Follow standard Java package naming conventions
- Use proper access modifiers (public, protected, private)
- Implement proper encapsulation
- Use builder pattern for complex object construction

5. Dapr SDK Specific
- Follow Java Dapr SDK patterns for workflow implementation
- Use proper exception handling in activities
- Implement proper context handling in workflow functions
- Ensure all ctx.getInput() calls are properly filled in
- Ensure that inner classes within their respective activity classes are importable by the models class. If it makes more sense to define them in the models directory, then do so.
- Ensure the Workflow runtime builder is properly filled in with correct types. 
- Register activities with the runtime builder properly to prevent comilation issues. Follow the structure of this example for activity registration:
```
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import io.dapr.workflows.runtime.WorkflowRuntimeBuilder;
import io.dapr.workflows.WorkflowActivity;

/**
 * Utility class for registering all workflow activities.
 */
public class ActivityRegistrar {
    private static final Logger logger = LoggerFactory.getLogger(ActivityRegistrar.class);
    /**
     * Registers all activities with the workflow runtime builder.
     * 
     * @param builder The workflow runtime builder
     */
    public static void registerAllActivities(WorkflowRuntimeBuilder builder) {
        registerActivity(builder, ChooseRecipeActivity.class);
    }
    
    /**
     * Registers a single activity with the workflow runtime builder.
     * 
     * @param builder The workflow runtime builder
     * @param activityClass The activity class to register
     */
    private static <T extends WorkflowActivity> void registerActivity(WorkflowRuntimeBuilder builder, Class<T> activityClass) {
        builder.registerActivity(activityClass);
        logger.info("Registered activity: {}", activityClass.getName());
    }
}
```

6. Java Durable Task Serialization Specifics
- **CRITICAL: Jackson-based JSON Serialization** - Java Durable Tasks use Jackson for all data serialization:
  ```java
  // Default DataConverter implementation uses Jackson
  public final class JacksonDataConverter implements DataConverter {
      private static final ObjectMapper jsonObjectMapper = JsonMapper.builder()
              .findAndAddModules()
              .build();
      
      @Override
      public String serialize(Object value) {
          return jsonObjectMapper.writeValueAsString(value);
      }
      
      @Override
      public <T> T deserialize(String jsonText, Class<T> targetType) {
          return jsonObjectMapper.readValue(jsonText, targetType);
      }
  }
  ```

- **Activity Input/Output Serialization** - Activities receive and return serialized data:
  ```java
  // Activity context automatically deserializes input
  public class ProcessPaymentActivity implements TaskActivity {
      @Override
      public Object run(TaskActivityContext ctx) {
          // Input is automatically deserialized based on the target type
          PaymentRequest request = ctx.getInput(PaymentRequest.class);
          
          // Process payment logic here...
          
          // Return object will be automatically serialized
          return new PaymentResponse(transactionId, success);
      }
  }
  
  // Orchestration calling activity
  Task<PaymentResponse> paymentTask = ctx.callActivity(
      "ProcessPaymentActivity",
      paymentRequest,  // This gets serialized automatically
      PaymentResponse.class);
  ```

- **Orchestration Input/Output Patterns** - Orchestrations handle serialized inputs:
  ```java
  public class OrderProcessingOrchestrator implements TaskOrchestration<OrderData, OrderResult> {
      @Override
      public OrderResult run(TaskOrchestrationContext ctx) {
          // Input is automatically deserialized
          OrderData orderData = ctx.getInput(OrderData.class);
          
          // Process order logic...
          
          // Return object will be automatically serialized
          return new OrderResult(orderData.getOrderId(), "completed");
      }
  }
  ```

- **Child Workflow Serialization** - Child workflows follow same patterns:
  ```java
  // Parent workflow calling child workflow
  public OrderResult run(TaskOrchestrationContext ctx) {
      OrderData orderData = ctx.getInput(OrderData.class);
      
      // Child workflow input is automatically serialized
      Task<FulfillmentResult> fulfillmentTask = ctx.callSubOrchestrator(
          "FulfillmentWorkflow",
          orderData.getFulfillmentData(),  // Serialized automatically
          FulfillmentResult.class);
      
      FulfillmentResult result = fulfillmentTask.await();
      return new OrderResult(orderData.getOrderId(), result.getStatus());
  }
  ```

- **Java Serialization Requirements for Data Classes**:
  ```java
  // Data classes must be Jackson-serializable
  public class OrderData {
      private String orderId;
      private String customerId;
      private List<OrderItem> items;
      
      // Default constructor required for Jackson deserialization
      public OrderData() {}
      
      public OrderData(String orderId, String customerId, List<OrderItem> items) {
          this.orderId = orderId;
          this.customerId = customerId;
          this.items = items;
      }
      
      // Getters and setters required for Jackson
      public String getOrderId() { return orderId; }
      public void setOrderId(String orderId) { this.orderId = orderId; }
      
      public String getCustomerId() { return customerId; }
      public void setCustomerId(String customerId) { this.customerId = customerId; }
      
      public List<OrderItem> getItems() { return items; }
      public void setItems(List<OrderItem> items) { this.items = items; }
  }
  ```

- **Custom DataConverter Configuration**:
  ```java
  // You can provide custom DataConverter if needed
  DurableTaskGrpcWorker worker = new DurableTaskGrpcWorkerBuilder()
      .grpcChannel(channel)
      .dataConverter(new CustomDataConverter())  // Custom serialization
      .build();
  
  DurableTaskGrpcClient client = new DurableTaskGrpcClientBuilder()
      .grpcChannel(channel)
      .dataConverter(new CustomDataConverter())  // Must match worker
      .build();
  ```

- **Error Handling for Serialization**:
  ```java
  // DataConverter can throw DataConverterException
  try {
      PaymentRequest request = ctx.getInput(PaymentRequest.class);
  } catch (DataConverter.DataConverterException e) {
      // Handle deserialization errors
      logger.error("Failed to deserialize payment request: " + e.getMessage());
      throw new TaskFailedException("Invalid input format", e);
  }
  ```

- **Parallel Execution Serialization Considerations**:
  ```java
  // All tasks in parallel execution use the same serialization mechanism
  List<Task<ProcessingResult>> parallelTasks = Arrays.asList(
      ctx.callActivity("ProcessPayment", paymentData, ProcessingResult.class),
      ctx.callActivity("UpdateInventory", inventoryData, ProcessingResult.class),
      ctx.callSubOrchestrator("NotifyCustomer", notificationData, ProcessingResult.class)
  );
  
  // Results are automatically deserialized when awaited
  List<ProcessingResult> results = ctx.allOf(parallelTasks).await();
  ```

7. Best Practices
- Follow Java coding conventions
- Use Javadoc for public APIs and complex methods only - rely on clear naming for simple code
- Implement proper logging
- Use proper dependency injection
- Follow SOLID principles
- Do not introduce made up functions. For example, `ctx.getCurrentInstant()` for something like the data is not actually a method anywhere.

8. Serialization Best Practices for Java Workflows
- **Always provide default constructors** for data classes used in workflows
- **Use Jackson annotations** when needed for custom serialization behavior
- **Test serialization round-trips** to ensure data integrity across workflow boundaries
- **Keep data classes simple** - avoid complex inheritance or circular references
- **Use primitive wrappers carefully** - Jackson handles them differently than primitives
- **Document serialization requirements** in data class Javadocs
- **Consider using records** (Java 14+) for immutable data transfer objects:
  ```java
  // Records work well for workflow data (Jackson 2.12+)
  public record PaymentRequest(String orderId, BigDecimal amount, String paymentMethod) {}
  public record PaymentResponse(String transactionId, boolean success, String errorMessage) {}
  ```

9. Common Serialization Pitfalls to Avoid
- **Don't use classes without default constructors** - Jackson requires them for deserialization
- **Don't assume type preservation** - Complex types may need explicit type information
- **Don't use non-serializable fields** - Mark transient or provide custom serialization
- **Don't rely on object identity** - Serialization creates new instances
- **Don't use Lambda expressions in data classes** - They are not serializable
- **Don't forget about nested objects** - All nested types must also be serializable
- **Don't mix different DataConverter implementations** - Client and worker must use the same one