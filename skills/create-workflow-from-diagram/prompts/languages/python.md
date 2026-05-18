# Python-Specific Instructions

## Language-Specific Guidelines

1. Type System
- Use type hints for all function parameters and return values
- Import typing modules: `from typing import Any, Dict, List, Optional, Union`
- Use `Any` for flexible types when dealing with serialized data
- Prefer descriptive type hints over generic `object` or untyped parameters

2. Error Handling
- Use try/except blocks appropriately
- Use specific exception types when possible
- Document potential exceptions in docstrings
- Avoid bare `except:` clauses - always specify exception types

3. Naming Conventions
- Use snake_case for variables, functions, and module names
- Use PascalCase for class names
- Use UPPER_SNAKE_CASE for constants
- Use descriptive names that reflect purpose and intent

4. Code Organization
- Follow PEP 8 style guidelines
- Use proper imports and module organization
- Use dataclasses for structured data when appropriate

5. Dapr Python Workflow SDK Specific
- **CRITICAL: Python Serialization Behavior** - Understand Dapr's JSON serialization:
  ```python
  # Dapr converts dataclasses to dicts during serialization:
  if dataclasses.is_dataclass(obj):
      d = dataclasses.asdict(obj)
      d[AUTO_SERIALIZED] = True
      return d
  
  # Dapr deserializes back as SimpleNamespace objects:
  if d.pop(AUTO_SERIALIZED, False):
      return types.SimpleNamespace(**d)
  ```

- **Workflow Function Patterns** - Follow deterministic patterns:
  ```python
  from dapr.ext.workflow import WorkflowRuntime, DaprWorkflowContext, when_all, when_any
  
  def my_workflow(ctx: DaprWorkflowContext, input_data: Any) -> Any:
      """
      Workflow functions must be deterministic and use yield for async operations
      """
      # Use yield for all async operations
      result = yield ctx.call_activity(activity_function, input=input_data)
      return result
  ```

- **Parallel Execution with when_all/when_any**:
  ```python
  # Use when_all for parallel execution where all tasks must complete
  tasks = [
      ctx.call_activity(activity1, input=data1),
      ctx.call_activity(activity2, input=data2),
      ctx.call_child_workflow(child_workflow, input=data3, instance_id=None)
  ]
  results = yield when_all(tasks)
  
  # Use when_any for first-wins scenarios or timeouts
  race_tasks = [
      ctx.call_activity(quick_activity, input=data),
      ctx.create_timer(ctx.current_utc_datetime + timedelta(seconds=30))
  ]
  winner = yield when_any(race_tasks)
  ```

- **Child Workflow Patterns** - Domain-specific data handling:
  ```python
  # Pass simple, serializable data to child workflows
  child_input = {
      "order_id": order.id,
      "customer_data": customer.__dict__,
      "items": [item.to_dict() for item in order.items]
  }
  
  # Call child workflow with domain-specific instance ID
  child_result = yield ctx.call_child_workflow(
      process_order_workflow,
      input=child_input,
      instance_id=f"order-{order.id}-processing"
  )
  
  # Handle results based on domain needs
  if child_result and child_result.get("success"):
      # Merge relevant data back to main workflow state
      order.status = child_result.get("final_status")
      order.tracking_number = child_result.get("tracking_number")
  ```

- **Activity Function Signatures** - Use proper typing:
  ```python
  from dapr.ext.workflow import WorkflowActivityContext
  
  def process_payment(ctx: WorkflowActivityContext, payment_data: Dict[str, Any]) -> Dict[str, Any]:
      """Activity functions can perform non-deterministic operations"""
      # Activities can do I/O, call external APIs, etc.
      payment_result = external_payment_api.charge(payment_data)
      return {
          "transaction_id": payment_result.id,
          "success": payment_result.status == "approved",
          "error": payment_result.error_message if payment_result.error_message else None
      }
  ```

6. Python-Specific Data Handling
- **Design data structures for your domain**:
  ```python
  # Example: E-commerce order processing
  @dataclass
  class OrderData:
      order_id: str
      customer_id: str
      items: List[Dict[str, Any]]
      total_amount: float
      status: str = "pending"
      
      def to_dict(self) -> Dict[str, Any]:
          """Convert to serializable dict for cross-workflow communication"""
          return asdict(self)
      
      @classmethod
      def from_dict(cls, data: Dict[str, Any]) -> 'OrderData':
          """Reconstruct from serialized data"""
          return cls(**data)
  ```

- **Handle serialization based on domain needs**:
  ```python
  # For simple data, use dicts directly
  simple_data = {"user_id": 123, "action": "approve"}
  
  # For complex objects, convert to/from dicts
  order_dict = order.to_dict()
  result = yield ctx.call_child_workflow(fulfillment_workflow, input=order_dict)
  
  # Reconstruct domain objects as needed
  if isinstance(result, dict):
      updated_order = OrderData.from_dict(result)
  elif hasattr(result, '__dict__'):
      # Handle SimpleNamespace from Dapr deserialization
      updated_order = OrderData.from_dict(result.__dict__)
  ```

7. Python Workflow Specifics
- **Python Deterministic Operations** - Safe in **workflow functions only**:
  ```python
  # Use ctx.current_utc_datetime for time operations (workflow functions only)
  deadline = ctx.current_utc_datetime + timedelta(hours=24)
  timer_task = ctx.create_timer(deadline)
  
  # Mathematical operations are deterministic
  total = sum(item["price"] for item in order_items)
  discount = total * 0.1 if customer.is_premium else 0.0
  ```

- **Python Activity Functions** - Can use non-deterministic operations freely:
  ```python
  # Activity functions can use standard Python operations
  def generate_order_number_activity(ctx: WorkflowActivityContext, input_data: Any) -> str:
      # Activities can use time.time(), random, I/O, etc.
      import time
      import random
      return f"ORDER-{int(time.time())}-{random.randint(1000, 9999)}"
  
  def get_current_timestamp_activity(ctx: WorkflowActivityContext, input_data: Any) -> str:
      # Activities use standard time operations
      from datetime import datetime
      return datetime.now().isoformat()
  
  def send_email_activity(ctx: WorkflowActivityContext, email_data: Dict[str, Any]) -> Dict[str, Any]:
      # Activities can perform I/O operations
      import smtplib
      # Send actual email...
      return {"sent": True, "message_id": "12345"}
  ```

8. Common Workflow Patterns
- **Saga Pattern** - Compensating transactions:
  ```python
  completed_steps = []
  try:
      # Step 1: Reserve inventory
      reserve_result = yield ctx.call_activity(reserve_inventory, input=order_data)
      completed_steps.append("inventory_reserved")
      
      # Step 2: Process payment
      payment_result = yield ctx.call_activity(process_payment, input=payment_data)
      completed_steps.append("payment_processed")
      
      # Step 3: Ship order
      ship_result = yield ctx.call_activity(ship_order, input=shipping_data)
      completed_steps.append("order_shipped")
      
  except Exception as e:
      # Compensate in reverse order
      for step in reversed(completed_steps):
          yield ctx.call_activity(f"compensate_{step}", input={"error": str(e)})
      raise
  ```

- **Fan-out/Fan-in Pattern**:
  ```python
  # Fan-out: Process multiple items in parallel
  parallel_tasks = []
  for item in order_items:
      task = ctx.call_activity(process_item_activity, input=item)
      parallel_tasks.append(task)
  
  # Fan-in: Wait for all to complete
  results = yield when_all(parallel_tasks)
  
  # Aggregate results
  total_processed = sum(1 for result in results if result.get("success"))
  ```

9. Common Pitfalls to Avoid
- **Don't assume object types after serialization** - data may come back as SimpleNamespace or dict
- **Don't use domain-agnostic patterns when domain-specific ones are clearer**
- **Don't ignore timeout scenarios** - use when_any with timers for long-running operations
- **Don't use bare except clauses** - specify exception types for proper error handling
- **Don't call non-async functions with `yield`** - only use yield with actual async operations
- **Don't rely on external state** - all state should be passed through workflow parameters or persisted through activities

10. Debugging and Testing
- **Test serialization with your domain objects**:
  ```python
  # Test that your domain objects serialize/deserialize correctly
  original_order = OrderData(order_id="123", customer_id="456", items=[], total_amount=100.0)
  serialized = original_order.to_dict()
  deserialized = OrderData.from_dict(serialized)
  assert original_order == deserialized
  ```

- **Handle Dapr serialization quirks**:
  ```python
  # When receiving data that might be SimpleNamespace
  def safe_get_dict(obj: Any) -> Dict[str, Any]:
      if isinstance(obj, dict):
          return obj
      elif hasattr(obj, '__dict__'):
          return obj.__dict__
      else:
          # Fallback for unexpected types
          return {"error": "Unexpected data type", "data": str(obj)}
  ```

11. Workflow Registration and Runtime
- **Decorator-based Registration** (Clean syntax, current common pattern):
  ```python
  from dapr.ext.workflow import WorkflowRuntime
  
  # Create runtime instance
  wf_runtime = WorkflowRuntime()
  
  @wf_runtime.register_workflow
  def order_processing_workflow(ctx: DaprWorkflowContext, input_data: Any) -> Any:
      """Main order processing workflow"""
      order = OrderData.from_dict(input_data)
      # Workflow logic here...
      return order.to_dict()
  
  @wf_runtime.register_workflow
  def fulfillment_workflow(ctx: DaprWorkflowContext, input_data: Any) -> Any:
      """Order fulfillment sub-workflow"""
      # Fulfillment logic here...
      return {"status": "fulfilled"}
  
  @wf_runtime.register_activity
  def process_payment(ctx: WorkflowActivityContext, payment_data: Dict[str, Any]) -> Dict[str, Any]:
      """Process payment activity"""
      # Payment processing logic...
      return {"transaction_id": "12345", "success": True}
  
  @wf_runtime.register_activity
  def send_notification(ctx: WorkflowActivityContext, notification_data: Dict[str, Any]) -> Dict[str, Any]:
      """Send notification activity"""
      # Notification logic...
      return {"sent": True}
  
  # Start the runtime
  wf_runtime.start()
  ```

- **Manual Registration** (Better for testing, more explicit control):
  ```python
  from dapr.ext.workflow import WorkflowRuntime
  
  # Define functions without decorators
  def order_processing_workflow(ctx: DaprWorkflowContext, input_data: Any) -> Any:
      """Main order processing workflow"""
      order = OrderData.from_dict(input_data)
      # Workflow logic here...
      return order.to_dict()
  
  def fulfillment_workflow(ctx: DaprWorkflowContext, input_data: Any) -> Any:
      """Order fulfillment sub-workflow"""
      # Fulfillment logic here...
      return {"status": "fulfilled"}
  
  def process_payment(ctx: WorkflowActivityContext, payment_data: Dict[str, Any]) -> Dict[str, Any]:
      """Process payment activity"""
      # Payment processing logic...
      return {"transaction_id": "12345", "success": True}
  
  def send_notification(ctx: WorkflowActivityContext, notification_data: Dict[str, Any]) -> Dict[str, Any]:
      """Send notification activity"""
      # Notification logic...
      return {"sent": True}
  
  # Option 2: Manual registration (better for testing, more explicit)
  def setup_workflow_runtime():
      wf_runtime = WorkflowRuntime()
      
      # Register workflows explicitly
      wf_runtime.register_workflow(order_processing_workflow)
      wf_runtime.register_workflow(fulfillment_workflow)
      
      # Register activities explicitly
      wf_runtime.register_activity(process_payment)
      wf_runtime.register_activity(send_notification)
      
      return wf_runtime
  
  # Usage
  runtime = setup_workflow_runtime()
  runtime.start()
  ```

- **Testing Considerations**:
  ```python
  # Testing decorated functions (may need __wrapped__)
  def test_decorated_workflow():
      # If using decorators, you might need to access the original function
      original_function = order_processing_workflow.__wrapped__ if hasattr(order_processing_workflow, '__wrapped__') else order_processing_workflow
      
      # Create mock context
      mock_ctx = create_mock_context()
      input_data = {"order_id": "123", "customer_id": "456"}
      
      # Test the function directly
      result = original_function(mock_ctx, input_data)
      assert result["order_id"] == "123"
  
  # Testing non-decorated functions (direct testing)
  def test_manual_workflow():
      # Direct testing without decorator concerns
      mock_ctx = create_mock_context()
      input_data = {"order_id": "123", "customer_id": "456"}
      
      # Test the function directly
      result = order_processing_workflow(mock_ctx, input_data)
      assert result["order_id"] == "123"
  
  # Testing activities independently
  def test_payment_activity():
      mock_ctx = create_mock_activity_context()
      payment_data = {"amount": 100.0, "card_token": "abc123"}
      
      result = process_payment(mock_ctx, payment_data)
      assert result["success"] is True
      assert "transaction_id" in result
  ```

**Registration Pattern Trade-offs:**

| Aspect | Decorator Approach | Manual Registration |
|--------|-------------------|-------------------|
| **Syntax** | ✅ Clean, declarative | ❌ More verbose |
| **Testing** | ❌ May need `__wrapped__` | ✅ Direct function testing |
| **Runtime Control** | ❌ Registration at import time | ✅ Explicit control over when/how |
| **IDE Support** | ✅ Clear function signatures | ✅ Clear function signatures |
| **Debugging** | ❌ Decorator overhead | ✅ Direct function calls |
| **Modularity** | ❌ Tight coupling to runtime | ✅ Functions independent of runtime |
| **Configuration** | ❌ Hard to conditionally register | ✅ Easy conditional registration |

**Recommendation:** Use **manual registration** for applications that need extensive testing, dynamic registration, or complex runtime configuration. Use **decorator approach** for simpler applications where clean syntax is preferred and testing complexity is acceptable. 