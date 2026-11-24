# Java SDK Testing

## Overview

The `create-workflow-java` skill generates no tests. This page shows how to add them. Activities are plain
classes and are tested like any other code. Workflow logic can be tested without a sidecar by mocking the
`WorkflowContext`. Running a workflow end to end needs a Dapr sidecar.

What to test, for every SDK: [core/testing.md](../core/testing.md).

Both tests below ran green with JUnit 5 and Mockito against `dapr-spring-bom` 1.19.1.

## Test dependency

Add Spring Boot's test starter (JUnit 5, AssertJ and Mockito, versions from the parent) to `pom.xml`:

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-test</artifactId>
  <scope>test</scope>
</dependency>
```

Run the tests with `mvn test`. The Verify step of the skill (`mvn -q -DskipTests package`) skips them.

## Unit testing an activity

Mock the `WorkflowActivityContext` so `getInput` returns the input record, call `run`, and assert on the
returned record. Pass mocked collaborators to the activity's constructor.

```java
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.dapr.workflows.WorkflowActivityContext;
import org.junit.jupiter.api.Test;

class ExtractTextActivityTest {

  @Test
  void extractsTextForTheDocument() {
    WorkflowActivityContext ctx = mock(WorkflowActivityContext.class);
    when(ctx.getInput(DocumentInput.class)).thenReturn(new DocumentInput("doc-1", "https://example.com/doc-1"));

    Object output = new ExtractTextActivity().run(ctx);

    assertThat(output).isEqualTo(new ExtractedText("doc-1", "text of https://example.com/doc-1"));
  }
}
```

Records compare by value, so `isEqualTo` on the whole output record is enough.

## Unit testing workflow logic

Mock the `WorkflowContext`. Stub each `callActivity` call to return a mocked `Task` whose `await()` returns the
activity's result, run the stub from `create()`, and verify what the workflow completed with. This tests the
order of the calls, the inputs passed between them and the branching, not the runtime.

```java
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.dapr.durabletask.Task;
import io.dapr.workflows.WorkflowContext;
import org.junit.jupiter.api.Test;

class DocumentPipelineWorkflowTest {

  @SuppressWarnings("unchecked")
  private static <T> Task<T> completed(T value) {
    Task<T> task = mock(Task.class);
    when(task.await()).thenReturn(value);
    return task;
  }

  @Test
  void chainsTheThreeActivitiesAndCompletesWithTheStoredSummary() {
    WorkflowContext ctx = mock(WorkflowContext.class);
    DocumentInput input = new DocumentInput("doc-1", "https://example.com/doc-1");
    ExtractedText text = new ExtractedText("doc-1", "text");
    Summary summary = new Summary("doc-1", "short");
    StoredSummary stored = new StoredSummary("doc-1", "summaries/doc-1");

    when(ctx.getInput(DocumentInput.class)).thenReturn(input);
    Task<ExtractedText> extract = completed(text);
    Task<Summary> summarize = completed(summary);
    Task<StoredSummary> store = completed(stored);
    when(ctx.callActivity(eq(ExtractTextActivity.class.getName()), eq(input), eq(ExtractedText.class)))
        .thenReturn(extract);
    when(ctx.callActivity(eq(SummarizeActivity.class.getName()), eq(text), eq(Summary.class)))
        .thenReturn(summarize);
    when(ctx.callActivity(eq(StoreSummaryActivity.class.getName()), eq(summary), eq(StoredSummary.class)))
        .thenReturn(store);

    new DocumentPipelineWorkflow().create().run(ctx);

    verify(ctx).complete(stored);
  }
}
```

### Key points

- `Task` is an abstract class; Mockito 5 (from `spring-boot-starter-test`) mocks it. Mockito prints a warning
  about self-attaching its agent on recent JDKs; the tests still run.
- Assign each mocked task to a variable before passing it to `thenReturn`, so the stubbing of `Task.await()`
  is complete before the outer `when(...)` runs.
- A workflow that logs through `ctx.getLogger()` needs `when(ctx.getLogger()).thenReturn(LoggerFactory.getLogger("test"))`;
  the mock returns `null` otherwise.
- To test a failure branch, make `await()` throw: `when(task.await()).thenThrow(...)`. `TaskFailedException`
  has no public constructor, so mock it too (`mock(TaskFailedException.class)`) and stub
  `getErrorDetails()` with a mocked `FailureDetails` if the workflow reads it. This ran green for the saga
  pattern's compensation branch.
- For a timeout branch, throw a mocked `TaskCanceledException` from the external event task's `await()`.
- The mock runs the body once, like a first execution. It does not replay it, so it cannot catch
  non-determinism.

## Integration testing with a sidecar

To run a workflow end to end, start the app with its sidecar (`dapr run -f .`), call `/start`, and poll
`/status/{instanceId}` until the run is `COMPLETED`. In a test, `DaprWorkflowClient.waitForWorkflowCompletion
(instanceId, Duration, true)` blocks until the run ends.

The Dapr Spring BOM also has `dapr-spring-boot-starter-test`, which starts a Dapr sidecar in a container with
Testcontainers for a `@SpringBootTest`. The skills do not generate such tests; see the Dapr Java SDK
documentation if you want them.

## Replay testing

The Java SDK has no replayer helper. To check replay, start a run, stop the app while the run waits on a timer
or an event, start it again, and check the run still completes with the expected output. Follow the rules in
[determinism.md](determinism.md) so replay has nothing to diverge on.
