# JavaScript-Specific Instructions

## Language-Specific Guidelines

1. Type System (Using JSDoc for Documentation)
- Use TypeScript-style type annotations in JSDoc when helpful for complex signatures
- Document parameters and return types for public workflow and activity functions

2. Error Handling
- Use try/catch blocks appropriately with async/await patterns
- Throw descriptive Error objects with meaningful messages
- Use proper error propagation in async functions
- Document potential errors in JSDoc comments

3. Naming Conventions
- Use camelCase for variables, functions, and method names
- Use PascalCase for class names and constructors
- Use UPPER_SNAKE_CASE for module-level constants
- Use descriptive names that reflect purpose and intent

4. Code Organization
- Use ES6+ modules with import/export syntax
- Use proper async/await patterns instead of callbacks
- Follow JavaScript Standard Style or Prettier formatting

5. Dapr JavaScript Workflow SDK Specific
- **CRITICAL: JavaScript Deterministic Workflows** - Use `async function*` (async generator functions) — the SDK dispatches on `Symbol.asyncIterator`, which only an async generator implements, so a plain sync `function*` compiles but misbehaves at runtime, and a plain `async function` (no `*`) has no `yield` to suspend on:
  ```javascript
  // CORRECT: async generator function for deterministic workflows
  async function* myWorkflow(context, input) {
      // Guard logging with isReplaying() to avoid duplicate output during replay —
      // there is no separate "replay-safe logger" helper in @dapr/dapr.
      if (!context.isReplaying()) {
          console.log('Starting myWorkflow');
      }

      // Use yield for all async operations
      const result = yield context.callActivity('processData', input);

      return { success: true, data: result };
  }
  
  // INCORRECT: plain async function, no generator (non-deterministic / can't yield)
  // async function myWorkflow(context, input) { ... }
  ```

- **Activity Function Patterns** - Use async functions for activities:
  ```javascript
  /**
   * Activity function
   * @param {Object} context - Activity context
   * @param {Object} input - Activity input
   * @returns {Promise<Object>} Activity result
   */
  async function myActivity(context, input) {
      const logger = context.log;
      
      try {
          // Activities can perform non-deterministic operations
          const result = await externalAPI.process(input);
          return { success: true, data: result };
      } catch (error) {
          logger.error(`Activity failed: ${error.message}`);
          return { success: false, error: error.message };
      }
  }
  ```

- **Parallel Execution with Promise Patterns**:
  ```javascript
  async function* parallelWorkflow(context, input) {
      // Create parallel tasks
      const tasks = [
          context.callActivity('activity1', input.data1),
          context.callActivity('activity2', input.data2),
          context.callActivity('activity3', input.data3)
      ];
      
      // Use yield with Promise.all for parallel execution
      const results = yield Promise.all(tasks);
      
      return { success: true, results };
  }
  ```

- **Child Workflow Patterns** - String-based workflow calls:
  ```javascript
  async function* parentWorkflow(context, input) {
      // Call child workflow by string name (no imports needed)
      const childResult = yield context.callChildWorkflow('childWorkflowName', input);
      
      if (childResult && childResult.success) {
          return { success: true, childData: childResult };
      }
      
      return { success: false, error: childResult?.error || 'Child workflow failed' };
  }
  ```

- **Import Path Precision** - Everything ships from the single `@dapr/dapr` package — there is no separate `@dapr/workflow` or `@dapr/durabletask-js` package to import from, even though `@dapr/durabletask-js` appears in the SDK's own `package.json`; it is an unused dependency, not something your code should import:
  ```javascript
  // CORRECT: import everything from @dapr/dapr
  import { WorkflowRuntime, DaprWorkflowClient } from '@dapr/dapr';

  // Context methods don't need imports
  async function* workflowWithContextMethods(context, input) {
      // whenAll/whenAny are methods on the context, not standalone imports
      const allResults = yield context.whenAll([task1, task2, task3]);
      const firstResult = yield context.whenAny([task1, task2]);
  }

  // INCORRECT: these packages don't exist / aren't what the SDK actually uses
  // import { WorkflowRuntime } from '@dapr/workflow';
  // import { whenAll } from '@dapr/durabletask-js/task';
  ```

6. JavaScript Serialization Specifics
- **JavaScript Serialization Behavior** - JavaScript-specific serialization characteristics:
  ```javascript
  // Data types that serialize correctly:
  const goodData = {
      // Primitives work perfectly
      id: 123,
      name: 'John Doe',
      isActive: true,
      score: 98.5,
      
      // Plain objects and arrays work
      address: {
          street: '123 Main St',
          city: 'Anytown'
      },
      tags: ['important', 'customer'],
      
      // Dates become strings (design for this)
      createdAt: new Date().toISOString(), // ✅ Use ISO strings
      
      // null and undefined
      optionalField: null // ✅ null serializes, undefined doesn't
  };
  
  // Data types that DON'T serialize correctly:
  const badData = {
      // Functions are lost
      calculate: () => 42, // ❌ Becomes undefined
      
      // Class instances lose methods
      user: new User('John'), // ❌ Becomes plain object, loses methods
      
      // Complex objects
      regex: /pattern/g, // ❌ Becomes empty object {}
      error: new Error('msg'), // ❌ Becomes plain object with limited properties
      
      // Circular references
      // parent: { child: { parent: parent } } // ❌ Causes JSON.stringify to throw
  };
  ```

- **JavaScript Workflow Data Patterns** - Design for serialization from the start:
  ```javascript
  // ✅ GOOD: Plain data structures
  async function* goodWorkflow(context, input) {
      const workflowData = {
          orderId: input.orderId,
          status: 'processing',
          items: input.items.map(item => ({
              id: item.id,
              quantity: item.quantity,
              price: item.price
          })),
          metadata: {
              startTime: new Date().toISOString(),
              retryCount: 0
          }
      };
      
      const result = yield context.callActivity('processOrder', workflowData);
      return result;
  }
  
  // ❌ BAD: Complex objects and functions
  async function* badWorkflow(context, input) {
      const workflowData = {
          order: new Order(input), // ❌ Class instance
          validator: input => input.isValid(), // ❌ Function
          config: require('./config'), // ❌ May contain non-serializable data
          startTime: new Date() // ❌ Date object becomes string, may cause issues
      };
      
      const result = yield context.callActivity('processOrder', workflowData);
      return result;
  }
  ```

- **Cross-Workflow Data Communication** - Handle serialization boundaries explicitly:
  ```javascript
  async function* parentWorkflow(context, input) {
      // Prepare data for child workflow - ensure it's serializable
      const childInput = {
          // Extract only serializable properties
          userId: input.user.id,
          orderData: {
              items: input.cart.items.map(item => ({
                  productId: item.product.id,
                  quantity: item.quantity,
                  price: item.currentPrice
              })),
              shippingAddress: input.user.defaultAddress,
              paymentMethod: input.selectedPayment.type
          }
      };
      
      const result = yield context.callChildWorkflow('processOrder', childInput);
      return result;
  }
  ```

7. Workflow Patterns and Best Practices
- **IMPORTANT**: Deterministic rules apply **ONLY to workflow functions**. Activities can and should use non-deterministic operations.

- **Deterministic Operations** - Safe in **workflow functions only**:
  ```javascript
  async function* deterministicWorkflow(context, input) {
      // Use context methods for time operations (workflow functions only)
      const deadline = new Date(context.getCurrentUtcDateTime().getTime() + (24 * 60 * 60 * 1000));
      const timerTask = context.createTimer(deadline);
      
      // Mathematical operations are deterministic
      const total = input.items.reduce((sum, item) => sum + item.price, 0);
      const discount = input.isPremium ? total * 0.1 : 0;
      
      return { total, discount };
  }
  ```

- **Non-deterministic Operations** - Must use activities (activities can use standard JavaScript operations):
  ```javascript
  async function* workflowWithActivities(context, input) {
      // In workflow function: Call activities for non-deterministic operations
      const randomId = yield context.callActivity('generateRandomId');
      
      const timestamp = yield context.callActivity('getCurrentTimestamp');
      
      const result = yield context.callActivity('sendNotification', input);
      
      return { randomId, timestamp, notificationSent: result.success };
  }
  ```

- **Activity Functions** - Can use non-deterministic operations freely:
  ```javascript
  // Activity functions can use standard JavaScript operations
  async function generateRandomIdActivity(context, input) {
      // Activities can use Date.now(), Math.random(), I/O, etc.
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      return `ID-${timestamp}-${random}`;
  }
  
  async function getCurrentTimestampActivity(context, input) {
      // Activities use standard time operations
      return new Date().toISOString();
  }
  
  async function sendNotificationActivity(context, input) {
      // Activities can perform I/O operations
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://api.notifications.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input)
      });
      return { success: response.ok, statusCode: response.status };
  }
  ```

8. Error Handling Best Practices
- **Workflow Error Patterns with Retry**:
  ```javascript
  async function* resilientWorkflow(context, input) {
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
              const result = yield context.callActivity('unreliableActivity', input);
              return { success: true, result, attempts: attempt };
          } catch (error) {
              if (!context.isReplaying()) {
                  console.warn(`Attempt ${attempt} failed: ${error.message}`);
              }
              
              if (attempt === maxRetries) {
                  return { success: false, error: error.message, attempts: attempt };
              }
              
              // Wait before retry (exponential backoff)
              const delay = Math.pow(2, attempt) * 1000;
              yield context.createTimer(new Date(context.getCurrentUtcDateTime().getTime() + delay));
          }
      }
  }
  ```

- **Compensation Pattern**:
  ```javascript
  async function* compensatingWorkflow(context, input) {
      const completedSteps = [];
      
      try {
          // Execute steps and track completion
          yield context.callActivity('step1', input);
          completedSteps.push('step1');
          
          yield context.callActivity('step2', input);
          completedSteps.push('step2');
          
          return { success: true };
          
      } catch (error) {
          if (!context.isReplaying()) {
              console.error(`Workflow failed, compensating completed steps`);
          }
          
          // Compensate in reverse order
          for (let i = completedSteps.length - 1; i >= 0; i--) {
              const step = completedSteps[i];
              try {
                  yield context.callActivity(`compensate_${step}`, input);
              } catch (compensationError) {
                  if (!context.isReplaying()) {
                      console.error(`Failed to compensate ${step}: ${compensationError.message}`);
                  }
              }
          }
          
          return { success: false, error: error.message };
      }
  }
  ```

9. Registration and Module Patterns
- **Workflow Registration**:
  ```javascript
  import { WorkflowRuntime } from '@dapr/dapr';
  import { mainWorkflow } from './workflows/main.js';
  import { childWorkflow } from './workflows/child.js';
  import { myActivity } from './activities/activity.js';
  
  const runtime = new WorkflowRuntime();
  
  // Register workflows and activities
  runtime.registerWorkflow(mainWorkflow);
  runtime.registerWorkflow(childWorkflow);
  runtime.registerActivity(myActivity);
  
  // Start the runtime
  await runtime.start();
  ```

- **Module Export Patterns**:
  ```javascript
  /**
   * Workflow function
   * @param {Object} context - Workflow context
   * @param {Object} input - Workflow input
   * @returns {Object} Workflow result
   */
  async function* myWorkflow(context, input) {
      // Workflow implementation
  }
  
  export { myWorkflow };
  ```

10. Critical Best Practices Summary
- **Always use async generator functions (`async function*`) for workflows — never a plain sync generator or a plain (non-generator) async function.** The SDK dispatches on `Symbol.asyncIterator`, which only an async generator implements; a plain `function*` compiles but misbehaves at runtime.
- **Use `yield` for all async operations within workflows**
- **Design data for JSON serialization** - plain objects, primitives, and arrays only
- **Convert dates to ISO strings** for cross-workflow communication
- **Avoid class instances, functions, and complex objects** in workflow data
- **Use context methods when available** (`context.whenAll`, `context.getCurrentUtcDateTime`)
- **Verify exact import paths** for Dapr SDK modules
- **Handle errors gracefully** with try/catch and meaningful error messages 