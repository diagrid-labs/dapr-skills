# Models

Define record types for workflow and activity input/output in a `Models` folder. Record types must be serializable since Dapr persists workflow state.

```csharp
namespace <ProjectNamespace>.Models;

public record WorkflowInput(string Message);
public record WorkflowOutput(string Result);
public record ActivityInput(string Data);
public record ActivityOutput(string ProcessedData);
```

### Key points

- Place all model record types in the `Models` folder/namespace.
- Put all model record types in one `cs` file.
- Use `record` types for immutability and built-in serialization support.
- Define separate input and output types for workflows and activities to keep contracts clear.
- Record types should be `public` so they can be referenced across namespaces.
