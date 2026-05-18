# Go-Specific Instructions

## Language-Specific Guidelines

1. Type System
- Replace any instance of `interface{}` with `any`
- Use strong typing for all variables and function parameters
- Prefer explicit type declarations over type inference where it improves readability

2. Error Handling
- Use explicit error returns instead of exceptions
- Follow the standard Go error handling pattern: `if err != nil { return err }`
- Use custom error types when appropriate
- Use `fmt.Errorf` with `%w` for error wrapping to maintain error chains

3. Naming Conventions
- Use camelCase for private variables and functions
- Use PascalCase for exported (public) types, functions, and methods
- Use short variable names in small scopes, longer descriptive names in larger scopes
- Use descriptive names for range loop variables: `workflowTask`, `eventTask`, `activityResult` instead of generic names

4. Code Organization
- Group related functionality into packages
- Use interfaces to define contracts
- Use struct embedding appropriately
- Child workflows should be in the same package as main workflows for Go

5. Dapr SDK Specific
- Use the exact function signature `func(workflow.ActivityContext) (any, error)` for activities
- Follow the Dapr workflow SDK patterns for activity registration
- Use proper context handling in workflow functions
- **Activity Registration:** When registering activities with `worker.RegisterActivity()`, pass activity functions directly - do not wrap them in generic types or use type assertions unless explicitly required by the SDK
- **Activity Arrays:** When creating arrays/slices of activities for bulk registration, use the specific function type `[]func(workflow.ActivityContext) (any, error)` instead of `[]any`
- **SDK Type Compatibility:** Never change function signatures that are part of the Dapr SDK contract. These are part of the public API that external systems depend on
- **Interface Compliance:** Ensure activity functions implement the exact interface expected by the Dapr workflow SDK, typically `func(workflow.ActivityContext) (any, error)`
- **Serialization patterns**:
  - Activity calls: Data passed to activities is automatically JSON serialized by Dapr
  - Child workflow calls: Data passed between workflows undergoes JSON serialization/deserialization
  - Input deserialization: Use `ctx.GetInput(&variable)` to deserialize workflow inputs into Go types
- **Child workflow patterns**:
  - Use `ctx.CallChildWorkflow(functionName, input)` for child workflow calls
  - Design appropriate return types for workflow results based on your domain needs
  - Handle state management patterns that fit your specific workflow requirements
- **Activity Registration:** When registering activities with `worker.RegisterActivity()`, pass activity functions directly - do not wrap them in generic types or use type assertions unless explicitly required by the SDK
- **Activity Arrays:** When creating arrays/slices of activities for bulk registration, use the specific function type `[]func(workflow.ActivityContext) (any, error)` instead of `[]any`
- **SDK Type Compatibility:** Never change function signatures that are part of the Dapr SDK contract. These are part of the public API that external systems depend on
- **Interface Compliance:** Ensure activity functions implement the exact interface expected by the Dapr workflow SDK, typically `func(workflow.ActivityContext) (any, error)`
- **Valid Types and SDK Usage:**
    - Use only valid, existing SDK methods and types from their actual import paths (e.g., in Go Dapr Workflow SDK, use `ctx.InstanceID()`, not `ctx.WorkflowExecutionID()`).
    - For SDK activity registration (e.g., `worker.RegisterActivity()`): pass activity functions directly without type wrapping or assertions that break SDK interface requirements.

6. Go-Specific Best Practices
- Use `go fmt` for code formatting
- Follow Go's standard project layout
- Use proper package documentation
- Implement proper error wrapping using `fmt.Errorf` with `%w`
- **Linting Compliance**: Write code that will pass golangci-lint checks
- **Slice Preallocation**: Use `make([]T, 0, size)` when capacity is known to avoid reallocations
- **Constants**: Use `iota` for enumerated constants when appropriate

7. Go-Specific Pitfalls to Avoid
- **Import Shadowing**: Never use variable names that match imported package names
- **Multiple String Operations**: Don't call `.String()` multiple times on the same builder - cache the result
- **Missing Error Checks**: Always check errors from workflow operations (`ctx.CallActivity`, `ctx.CallChildWorkflow`)
- **Improper Parallel Execution**: Use proper type handling for mixed activity and child workflow parallel 
- Do not add a definition for `GetLogger()`, or add a file to add a logger, as a file with the declaration for this will be included outside of the scope of this prompt. You can assume `GetLogger()` exists already.

8. Go JSON Serialization Specifics
- **Go-Specific Serialization Issues** - Be aware of Go's unique serialization characteristics:
  ```go
  // Data types that serialize correctly:
  type WorkflowData struct {
      // Primitives work perfectly
      ID          int     `json:"id"`
      Name        string  `json:"name"`
      IsActive    bool    `json:"is_active"`
      Score       float64 `json:"score"`
      
      // Structs and slices work if all fields are serializable
      Address     Address   `json:"address"`
      Tags        []string  `json:"tags"`
      
      // Use time.RFC3339 for consistent time serialization
      CreatedAt   string    `json:"created_at"` // Store as ISO string
      
      // Pointers to serializable types work
      OptionalData *string  `json:"optional_data,omitempty"`
  }
  
  // Data types that DON'T serialize correctly:
  type ProblematicData struct {
      // Functions are lost
      Calculate   func() int `json:"-"` // ❌ Use json:"-" to exclude
      
      // Channels, mutexes, and other Go-specific types
      Ch          chan string    `json:"-"` // ❌ Exclude from JSON
      Mutex       sync.Mutex     `json:"-"` // ❌ Exclude from JSON
      
      // time.Time can be problematic - use strings instead
      Timestamp   time.Time      `json:"-"` // ❌ Use string instead
      TimestampStr string        `json:"timestamp"` // ✅ Use this
      
      // Unexported fields won't serialize
      privateData string         // ❌ Won't appear in JSON
  }
  ```

- **Go Workflow Data Design Patterns** - Design for serialization from the start:
  ```go
  // ✅ GOOD: Serializable workflow state
  type OrderWorkflowState struct {
      OrderID     string                 `json:"order_id"`
      Status      string                 `json:"status"`
      Items       []OrderItem            `json:"items"`
      TotalAmount float64                `json:"total_amount"`
      Metadata    map[string]interface{} `json:"metadata"`
      CreatedAt   string                 `json:"created_at"` // ISO string
      RetryCount  int                    `json:"retry_count"`
  }
  
  type OrderItem struct {
      ProductID string  `json:"product_id"`
      Quantity  int     `json:"quantity"`
      Price     float64 `json:"price"`
  }
  
  // ❌ BAD: Non-serializable workflow state
  type BadWorkflowState struct {
      Order       *Order                 // ❌ Complex business object
      Validator   func(Order) bool       // ❌ Function
      Config      *AppConfig             // ❌ May contain non-serializable data
      StartTime   time.Time              // ❌ time.Time serialization issues
      Logger      *log.Logger            // ❌ Non-serializable
  }
  ```