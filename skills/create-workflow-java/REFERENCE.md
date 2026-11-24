# Reference: Dapr Workflow Java Application

Package versions come from [dapr-versions.md](../dapr-shared/dapr-versions.md) — change a pin there, not here.

## Folder structure

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml
├── local.http
├── README.md
├── resources/
│   └── statestore.yaml
└── <ProjectName>/
    ├── pom.xml
    └── src/main/
        ├── resources/
        │   └── application.properties
        └── java/<javaPackage>/        (one folder per segment: com/example/...)
            ├── Application.java
            ├── <WorkflowName>.java
            ├── <ActivityName>.java
            ├── <WorkflowInput>.java
            ├── <WorkflowOutput>.java
            ├── <ActivityInput>.java
            ├── <ActivityOutput>.java
            ├── StatusResponse.java
            └── <WorkflowName>Controller.java
```

- All classes share one package, `<javaPackage>`, so component scanning finds them. The folder under
  `src/main/java` follows the package (`com.example.shiptrack` is `com/example/shiptrack`).
- Workflows, activities and records are each a top-level type in a file of their own.

## dapr.yaml

Create a `dapr.yaml` multi-app run file in the project root. This file configures the Dapr sidecar and points to the resources folder.

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
apps:
  - appID: <app-id>
    appDirPath: <ProjectName>
    appPort: <app-port>
    daprHTTPPort: 3555
    command: ["mvn", "spring-boot:run"]
```

### Key points

- `command` runs the app through the `spring-boot-maven-plugin` from the Spring Boot parent. The first start
  downloads the dependencies, so the app can take a minute to come up.
- `appPort` must equal `server.port` in `application.properties`.
- `appDirPath` is the Maven project folder. `appLogDestination: fileAndConsole` writes `.dapr/logs/` there,
  which `.gitignore` excludes.
- No `dapr.client.*` properties are needed: `dapr run` exports `DAPR_HTTP_PORT` and `DAPR_GRPC_PORT`, and the
  SDK reads them.
- Start the app with `dapr run -f .` in the project root.

## resources/statestore.yaml

See [`../dapr-shared/dapr-statestore.md`](../dapr-shared/dapr-statestore.md) for the full example and key points.

## pom.xml, Application.java, application.properties and .gitignore

See [`../dapr-shared/java-workflow-project.md`](../dapr-shared/java-workflow-project.md) for the full files and key points.

## Records

See [`../dapr-shared/java-models.md`](../dapr-shared/java-models.md) for the full example and key points.

## Workflow class

See [`../dapr-shared/java-workflow-class.md`](../dapr-shared/java-workflow-class.md) for the full example, key points and determinism rules.

## Activity classes

See [`../dapr-shared/java-activity-class.md`](../dapr-shared/java-activity-class.md) for the full example and key points.

## Controller

See [`../dapr-shared/java-workflow-endpoints.md`](../dapr-shared/java-workflow-endpoints.md) for the full controller and key points.

## local.http

See [`../dapr-shared/java-local-http.md`](../dapr-shared/java-local-http.md) for the full example and key points.

## Workflow patterns

Each example is a complete workflow class; its activities follow the activity template. Pick the pattern the
user described and rename the classes and records after the user's domain, following
[workflow-placeholders.md](../dapr-shared/workflow-placeholders.md). Every class lives in `<javaPackage>`, so
the `package` line is left out.

### Task chaining

Records (one file each):

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

#### Key points

- Each activity's output is the next activity's input; `.await()` returns the typed record.
- Completed calls are not run again on replay: they return their recorded results.

### Fan-out/fan-in

Records (one file each):

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

#### Key points

- `callActivity` without `.await()` only schedules the activity. `ctx.allOf(tasks).await()` waits for all of
  them and returns the results in the order of `tasks`.
- `Task` is `io.dapr.durabletask.Task`. Never use `CompletableFuture`, threads or parallel streams.
- If one task fails, `allOf(...).await()` throws `CompositeTaskFailedException` after all tasks finished.

### Child workflows

Records (one file each):

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

#### Key points

- Call a child workflow by its class name, like an activity: `<ChildWorkflow>.class.getName()`.
- Derive the child's instance id from the parent's (`ctx.getInstanceId() + "-" + region`), never from
  `UUID.randomUUID()`.
- A failed child surfaces in the parent as a `TaskFailedException`.

### Monitor pattern

Records (one file each):

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

#### Key points

- `ctx.createTimer(Duration).await()` is a durable sleep. Never use `Thread.sleep`.
- `ctx.continueAsNew(nextInput)` restarts the workflow with a fresh history, so the monitor can run
  indefinitely. It must be the last workflow action: `return` straight after it.
- Never wrap the timer in `while (true)`; every iteration would grow the history.

### External system interaction (human-in-the-loop)

Records (one file each):

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

#### Key points

- `ctx.waitForExternalEvent(name, timeout, Class).await()` throws `TaskCanceledException` when the timeout
  expires. Catch it, log through `ctx.getLogger()`, complete with a timed-out result and `return`.
- Declare the event name as a constant. The `raise-event` request in `local.http` uses the same name, and its
  JSON body matches the event record (here `{"approved": true, "approver": "Ada"}`).
- Add the `POST /raise-event/{instanceId}/{eventName}` endpoint from the controller template; without it
  the workflow can never receive the event.

### Saga / compensation

Records (one file each):

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

#### Key points

- Catch `TaskFailedException`, never `Exception`: a broad catch also swallows the SDK's internal
  `OrchestratorBlockedException`.
- Give each forward step a compensating activity, run the compensations in reverse order, and make them
  idempotent.
- Do not rethrow after compensating: complete with a result that says what happened, so the run ends
  `COMPLETED` and `/status` shows the outcome.

## Retry policies

Pass a `WorkflowTaskOptions` with a `WorkflowTaskRetryPolicy` to `callActivity` for every activity that can
fail transiently (a remote call, a flaky dependency). Declare it once as a constant on the workflow class:

```java
import io.dapr.workflows.WorkflowTaskOptions;
import io.dapr.workflows.WorkflowTaskRetryPolicy;
import java.time.Duration;

private static final WorkflowTaskOptions RETRY = new WorkflowTaskOptions(
    WorkflowTaskRetryPolicy.newBuilder()
        .setMaxNumberOfAttempts(3)
        .setFirstRetryInterval(Duration.ofSeconds(1))
        .setBackoffCoefficient(2.0)
        .setMaxRetryInterval(Duration.ofSeconds(10))
        .build());

// in the workflow stub
ChargeResult charge = ctx.callActivity(
    ChargeCardActivity.class.getName(), payment, RETRY, ChargeResult.class).await();
```

### Key points

- `setMaxNumberOfAttempts` counts the first attempt. The wait starts at `setFirstRetryInterval`, is multiplied
  by `setBackoffCoefficient` after each retry and is capped by `setMaxRetryInterval`.
- The retries are durable: they survive an app restart.
- When the attempts are used up, `.await()` throws `TaskFailedException`; catch it to compensate or to complete
  with a failure result.
- The activity runs again on every attempt, so it must be idempotent.
- Child workflows take the same options: `ctx.callChildWorkflow(name, input, instanceId, RETRY, Result.class)`.

## Deeper reference

These are not needed to scaffold the project, but answer the questions that come next:

- [`../dapr-shared/references/core/patterns.md`](../dapr-shared/references/core/patterns.md) — the pattern catalogue.
- [`../dapr-shared/references/core/child-workflows.md`](../dapr-shared/references/core/child-workflows.md) — composing workflows.
- [`../dapr-shared/references/core/timers.md`](../dapr-shared/references/core/timers.md) — durable timers.
- [`../dapr-shared/references/core/external-events.md`](../dapr-shared/references/core/external-events.md) — human-in-the-loop and waiting.
- [`../dapr-shared/references/core/testing.md`](../dapr-shared/references/core/testing.md) — how to test a workflow.
- [`../dapr-shared/references/core/versioning.md`](../dapr-shared/references/core/versioning.md) — changing a workflow already in flight.
- [`../dapr-shared/references/core/gotchas.md`](../dapr-shared/references/core/gotchas.md) — the mistakes that bite first.
- [`../dapr-shared/references/core/troubleshooting.md`](../dapr-shared/references/core/troubleshooting.md) — diagnosing a stuck run.
- [`../dapr-shared/references/core/error-reference.md`](../dapr-shared/references/core/error-reference.md) — the error taxonomy.
- [`../dapr-shared/references/core/activity-patterns.md`](../dapr-shared/references/core/activity-patterns.md) — activity shapes.
- [`../dapr-shared/references/core/determinism.md`](../dapr-shared/references/core/determinism.md) — why replay constrains the workflow body.
- [`../dapr-shared/references/ops/monitoring.md`](../dapr-shared/references/ops/monitoring.md) — what to watch in production.
- [`../dapr-shared/references/ops/scaling.md`](../dapr-shared/references/ops/scaling.md) — scaling the workers.
- [`../dapr-shared/references/ops/state-store-selection.md`](../dapr-shared/references/ops/state-store-selection.md) — choosing a state store.
- [`../dapr-shared/references/ops/troubleshooting-ops.md`](../dapr-shared/references/ops/troubleshooting-ops.md) — operational failure modes.
- [`../dapr-shared/references/java/java.md`](../dapr-shared/references/java/java.md) — the Java SDK reference.
- [`../dapr-shared/references/java/patterns.md`](../dapr-shared/references/java/patterns.md) — patterns in Java.
- [`../dapr-shared/references/java/determinism.md`](../dapr-shared/references/java/determinism.md) — determinism in Java.
- [`../dapr-shared/references/java/error-handling.md`](../dapr-shared/references/java/error-handling.md) — error handling in Java.
- [`../dapr-shared/references/java/data-handling.md`](../dapr-shared/references/java/data-handling.md) — data handling in Java (records, the Jackson 2 rule).
- [`../dapr-shared/references/java/gotchas.md`](../dapr-shared/references/java/gotchas.md) — Java gotchas, from the reference builds.
- [`../dapr-shared/references/java/testing.md`](../dapr-shared/references/java/testing.md) — testing in Java.

## Running Locally

See [`../dapr-shared/running-locally-dapr.md`](../dapr-shared/running-locally-dapr.md) for instructions.

## Running with Diagrid

See [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md) for instructions.
