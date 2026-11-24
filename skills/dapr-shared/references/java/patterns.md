# Java SDK Patterns

Each pattern is a complete workflow class. They were compiled against `dapr-spring-bom` 1.19.1 with the
`pom.xml` from [java-workflow-project.md](../../java-workflow-project.md). Activities follow
[java-activity-class.md](../../java-activity-class.md) and are left out; payload records are listed once per
pattern and each goes in its own file (shown here on one line each for brevity). Every class lives in the
app's package, so the `package` line is left out too.

The pattern catalogue for every SDK, and when to pick which: [core/patterns.md](../core/patterns.md).

## Pattern 1: Activity Chaining

Each activity's output is the next activity's input.

```java
public record DocumentInput(String documentId, String url) { }
public record ExtractedText(String documentId, String text) { }
public record Summary(String documentId, String summary) { }
public record StoredSummary(String documentId, String location) { }
```

```java
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import org.springframework.stereotype.Component;

@Component
public class DocumentPipelineWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      DocumentInput input = ctx.getInput(DocumentInput.class);

      ExtractedText text = ctx.callActivity(
          ExtractTextActivity.class.getName(), input, ExtractedText.class).await();
      Summary summary = ctx.callActivity(
          SummarizeActivity.class.getName(), text, Summary.class).await();
      StoredSummary stored = ctx.callActivity(
          StoreSummaryActivity.class.getName(), summary, StoredSummary.class).await();

      ctx.complete(stored);
    };
  }
}
```

### Key points

- Each `.await()` returns the previous activity's record, typed by the class passed to `callActivity`.
- On replay the completed calls return their recorded results without running the activities again.

## Pattern 2: Fan-Out / Fan-In

Schedule one activity per item, then wait for all of them with `ctx.allOf`.

```java
public record ImageBatch(String batchId, List<String> imageIds) { }
public record ResizedImage(String imageId, long bytes) { }
public record BatchResult(String batchId, int imageCount, long totalBytes) { }
```

```java
import io.dapr.durabletask.Task;
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class ImageBatchWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      ImageBatch batch = ctx.getInput(ImageBatch.class);

      List<Task<ResizedImage>> tasks = batch.imageIds().stream()
          .map(imageId -> ctx.callActivity(ResizeImageActivity.class.getName(), imageId, ResizedImage.class))
          .toList();
      List<ResizedImage> resized = ctx.allOf(tasks).await();

      long totalBytes = resized.stream().mapToLong(ResizedImage::bytes).sum();
      ctx.complete(new BatchResult(batch.batchId(), resized.size(), totalBytes));
    };
  }
}
```

### Key points

- `callActivity` without `.await()` only schedules the activity; `ctx.allOf(tasks).await()` waits for all of
  them and returns the results in the order of `tasks`.
- `Task` is `io.dapr.durabletask.Task`.
- If any activity fails, `allOf(...).await()` throws a `CompositeTaskFailedException` once all tasks are done;
  `getExceptions()` holds each failure.
- Keep a batch bounded. For thousands of items, split the batch over child workflows.

## Pattern 3: Saga with Compensation

When a later step fails, undo the steps that already succeeded and complete with a failure result.

```java
public record TripRequest(String tripId, String destination) { }
public record FlightBooking(String tripId, String flightRef) { }
public record HotelBooking(String tripId, String hotelRef) { }
public record TripResult(String tripId, boolean booked, String message) { }
```

```java
import io.dapr.durabletask.TaskFailedException;
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import org.springframework.stereotype.Component;

@Component
public class TripBookingWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      TripRequest request = ctx.getInput(TripRequest.class);

      FlightBooking flight = ctx.callActivity(
          BookFlightActivity.class.getName(), request, FlightBooking.class).await();

      try {
        HotelBooking hotel = ctx.callActivity(
            BookHotelActivity.class.getName(), flight, HotelBooking.class).await();
        ctx.complete(new TripResult(request.tripId(), true,
            "Booked flight " + flight.flightRef() + " and hotel " + hotel.hotelRef()));
      } catch (TaskFailedException e) {
        ctx.getLogger().warn("Hotel booking failed for trip {}: {}",
            request.tripId(), e.getErrorDetails().getErrorMessage());
        ctx.callActivity(CancelFlightActivity.class.getName(), flight).await();
        ctx.complete(new TripResult(request.tripId(), false,
            "Hotel booking failed; flight " + flight.flightRef() + " was cancelled"));
      }
    };
  }
}
```

### Key points

- Catch `TaskFailedException`, never `Exception`: a broad catch also swallows the SDK's
  `OrchestratorBlockedException` (see [determinism.md](determinism.md)).
- `e.getErrorDetails()` carries the activity's exception type and message.
- Give each forward step a compensating activity and run the compensations in reverse order.
- Do not rethrow after compensating: complete with a result that says what happened, so the run ends
  `COMPLETED` and callers can read the outcome.
- Compensating activities must be idempotent.

## Pattern 4: Human-in-the-Loop (External Event with Timeout)

Wait for an event raised through the `/raise-event` endpoint, with a timeout.

```java
public record ApprovalRequest(String documentId, String author) { }
public record ApprovalDecision(boolean approved, String approver) { }
public record ApprovalResult(String documentId, String status) { }
```

```java
import io.dapr.durabletask.TaskCanceledException;
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class DocumentApprovalWorkflow implements Workflow {

  public static final String APPROVAL_EVENT = "ApprovalDecision";

  @Override
  public WorkflowStub create() {
    return ctx -> {
      ApprovalRequest request = ctx.getInput(ApprovalRequest.class);
      ctx.callActivity(RequestApprovalActivity.class.getName(), request).await();

      ApprovalDecision decision;
      try {
        decision = ctx.waitForExternalEvent(
            APPROVAL_EVENT, Duration.ofDays(1), ApprovalDecision.class).await();
      } catch (TaskCanceledException e) {
        ctx.getLogger().warn("No approval decision for document {} within 1 day", request.documentId());
        ctx.complete(new ApprovalResult(request.documentId(), "TIMED_OUT"));
        return;
      }

      if (!decision.approved()) {
        ctx.complete(new ApprovalResult(request.documentId(), "REJECTED by " + decision.approver()));
        return;
      }
      ctx.callActivity(PublishDocumentActivity.class.getName(), request).await();
      ctx.complete(new ApprovalResult(request.documentId(), "PUBLISHED"));
    };
  }
}
```

### Key points

- `ctx.waitForExternalEvent(name, timeout, Class).await()` throws `io.dapr.durabletask.TaskCanceledException`
  when the timeout expires (verified with a 30-second timeout). Catch it, log through `ctx.getLogger()`,
  complete with a timed-out result and `return`; never let it fail the workflow.
- Declare the event name as a constant. The `raise-event` request in `local.http` uses the same name, and its
  JSON body matches the event record (`{"approved": true, "approver": "..."}`).
- The app needs the `POST /raise-event/{instanceId}/{eventName}` endpoint from
  [java-workflow-endpoints.md](../../java-workflow-endpoints.md).
- An event raised before the workflow starts waiting is kept and delivered when it does.

## Pattern 5: Monitor (Eternal Workflow with continueAsNew)

Check something on a schedule without growing the history.

```java
public record MonitorInput(String endpointId, int checks) { }
public record EndpointHealth(String endpointId, boolean healthy) { }
public record MonitorResult(String endpointId, int checks) { }
```

```java
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class EndpointMonitorWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      MonitorInput input = ctx.getInput(MonitorInput.class);

      EndpointHealth health = ctx.callActivity(
          CheckEndpointActivity.class.getName(), input, EndpointHealth.class).await();

      if (!health.healthy()) {
        ctx.createTimer(Duration.ofSeconds(30)).await();
        ctx.continueAsNew(new MonitorInput(input.endpointId(), input.checks() + 1));
        return;
      }

      ctx.complete(new MonitorResult(input.endpointId(), input.checks() + 1));
    };
  }
}
```

### Key points

- `ctx.createTimer(Duration).await()` is a durable sleep; it survives an app restart.
- `ctx.continueAsNew(nextInput)` restarts the workflow with the new input and an empty history. It must be the
  last workflow action: `return` straight after it.
- Never write `while (true)` around the timer: each iteration adds to the history.

## Pattern 6: Child Workflows

A parent workflow starts one child workflow per item and waits for all of them.

```java
public record RolloutRequest(String releaseId, List<String> regions) { }
public record RegionDeployment(String releaseId, String region) { }
public record DeploymentResult(String region, boolean succeeded) { }
public record RolloutResult(String releaseId, List<DeploymentResult> deployments) { }
```

```java
import io.dapr.durabletask.Task;
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class RegionRolloutWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      RolloutRequest request = ctx.getInput(RolloutRequest.class);

      List<Task<DeploymentResult>> deployments = request.regions().stream()
          .map(region -> ctx.callChildWorkflow(
              DeployRegionWorkflow.class.getName(),
              new RegionDeployment(request.releaseId(), region),
              ctx.getInstanceId() + "-" + region,
              DeploymentResult.class))
          .toList();

      ctx.complete(new RolloutResult(request.releaseId(), ctx.allOf(deployments).await()));
    };
  }
}
```

```java
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import org.springframework.stereotype.Component;

@Component
public class DeployRegionWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      RegionDeployment deployment = ctx.getInput(RegionDeployment.class);
      DeploymentResult result = ctx.callActivity(
          DeployRegionActivity.class.getName(), deployment, DeploymentResult.class).await();
      ctx.complete(result);
    };
  }
}
```

### Key points

- Call a child by its class name, `<ChildWorkflow>.class.getName()`, like an activity: `@EnableDaprWorkflows`
  registers every workflow under its canonical name.
- Pass a child instance id derived from the parent's (`ctx.getInstanceId() + "-" + region`) so each child is
  easy to find and replays to the same id. Never use `UUID.randomUUID()` for it.
- A child has its own history, so a large fan-out spread over children keeps each history small.
- A failed child surfaces in the parent as a `TaskFailedException`.
- More on composing workflows: [core/child-workflows.md](../core/child-workflows.md).
