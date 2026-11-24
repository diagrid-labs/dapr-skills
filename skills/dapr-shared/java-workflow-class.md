# Workflow Class (Java)

Resolve every placeholder from the specification interview before copying this file; the vocabulary is in
[workflow-placeholders.md](workflow-placeholders.md).

A workflow is a top-level Spring `@Component` that implements `io.dapr.workflows.Workflow`. Its `create()`
method returns a `WorkflowStub`, a lambda that receives the `WorkflowContext`, reads the input, calls
activities and completes with the output. Use the records from [java-models.md](java-models.md) for input
and output. Create `src/main/java/<javaPackage>/<WorkflowName>.java`:

```java
package <javaPackage>;

import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import org.springframework.stereotype.Component;

@Component
public class <WorkflowName> implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      <WorkflowInput> input = ctx.getInput(<WorkflowInput>.class);
      ctx.getLogger().info("<WorkflowName> {} started", ctx.getInstanceId());

      <ActivityOutput> activityOutput = ctx.callActivity(
          <ActivityName>.class.getName(), new <ActivityInput>(input.message()), <ActivityOutput>.class).await();

      ctx.complete(new <WorkflowOutput>(activityOutput.processedData()));
    };
  }
}
```

### Key points

- The workflow is a top-level `public` class annotated with `@Component`, never a nested class.
  `@EnableDaprWorkflows` registers it under its canonical class name, and the controller schedules it with
  `scheduleNewWorkflow(<WorkflowName>.class, ...)`.
- Read the input with `ctx.getInput(<WorkflowInput>.class)`.
- Call an activity with `ctx.callActivity(<ActivityName>.class.getName(), input, <ActivityOutput>.class).await()`.
  The activity is registered under its canonical name, which equals `getName()` for a top-level class.
  Never write the activity name as a string literal.
- `.await()` blocks the workflow until the activity result is in the history. Call it on every task you
  schedule, either directly or through `ctx.allOf(...)` / `ctx.anyOf(...)`.
- Finish with `ctx.complete(output)`. A workflow that returns without calling it completes with no output.
- Log only through `ctx.getLogger()`. It logs once per run, although the workflow body is replayed after
  every activity.
- When an activity can fail transiently, pass a `WorkflowTaskOptions` with a `WorkflowTaskRetryPolicy` to
  `callActivity` (see the create skill's `REFERENCE.md`, "Retry policies").
- Chain activities by passing one activity's output (or a record built from it) as the next activity's input.

### Workflow determinism

The runtime replays the `WorkflowStub` from the start every time the workflow resumes, so the body must make
the same calls in the same order on every replay. Never use these inside a workflow:

- `Instant.now()`, `LocalDateTime.now()`, `System.currentTimeMillis()`: use `ctx.getCurrentInstant()`.
- `UUID.randomUUID()`: use `ctx.newUuid()`.
- `new Random()`, `Math.random()`: generate the value in an activity.
- `Thread.sleep(...)`: use `ctx.createTimer(Duration).await()`.
- `new Thread(...)`, `CompletableFuture`, executors or parallel streams: run activities in parallel with
  `ctx.allOf(...)` instead.
- I/O (HTTP calls, database queries, file access, reading environment variables): do it in an activity.
- Calls to Spring beans: the workflow class takes no collaborators. Give them to an activity instead.
- `catch (Exception e)` or `catch (Throwable t)` around `.await()`: catch `TaskFailedException` (a failed
  activity) or `TaskCanceledException` (an external event timeout) instead.
- Unbounded loops (`while (true)` or a loop whose condition never changes) that schedule activities, child
  workflows or timers: every iteration grows the workflow history. Bounded loops (retry up to N times,
  iterate over an input list) are fine. For a long-running loop, handle one iteration per run and call
  `ctx.continueAsNew(nextInput)`, then `return` straight away.
