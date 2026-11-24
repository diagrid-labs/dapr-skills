# Dapr Workflow management endpoints (Java)

Resolve every placeholder from the specification interview before copying this file; the vocabulary is in
[workflow-placeholders.md](workflow-placeholders.md).

These endpoints are the canonical management surface used by the Java workflow skills and checked by
`review-workflow-management`. They match the .NET routes: `POST /start`, `GET /status/{instanceId}`,
`POST /pause/{instanceId}`, `POST /resume/{instanceId}`, `POST /terminate/{instanceId}` and
`POST /raise-event/{instanceId}/{eventName}`.

## Controller

One `@RestController` takes the autoconfigured `DaprWorkflowClient` through its constructor. Create
`src/main/java/<javaPackage>/<WorkflowName>Controller.java`:

```java
package <javaPackage>;

import io.dapr.workflows.client.DaprWorkflowClient;
import io.dapr.workflows.client.WorkflowRuntimeStatus;
import io.dapr.workflows.client.WorkflowState;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class <WorkflowName>Controller {

  private final DaprWorkflowClient workflowClient;

  public <WorkflowName>Controller(DaprWorkflowClient workflowClient) {
    this.workflowClient = workflowClient;
  }

  @PostMapping("/start")
  public ResponseEntity<Map<String, String>> start(@RequestBody <WorkflowInput> input) {
    if (input.id() != null && isActive(workflowClient.getWorkflowState(input.id(), false))) {
      return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("instanceId", input.id()));
    }
    String instanceId = workflowClient.scheduleNewWorkflow(<WorkflowName>.class, input, input.id());
    return ResponseEntity.ok(Map.of("instanceId", instanceId));
  }

  @GetMapping("/status/{instanceId}")
  public ResponseEntity<?> status(@PathVariable String instanceId) {
    WorkflowState state = workflowClient.getWorkflowState(instanceId, true);
    if (!exists(state)) {
      return ResponseEntity.notFound().build();
    }
    <WorkflowOutput> output = state.getRuntimeStatus() == WorkflowRuntimeStatus.COMPLETED
        ? state.readOutputAs(<WorkflowOutput>.class)
        : null;
    return ResponseEntity.ok(new StatusResponse(
        state.getWorkflowId(), state.getName(), state.getRuntimeStatus().name(), output));
  }

  @PostMapping("/pause/{instanceId}")
  public ResponseEntity<Void> pause(@PathVariable String instanceId) {
    workflowClient.suspendWorkflow(instanceId, "Paused through the API");
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/resume/{instanceId}")
  public ResponseEntity<Void> resume(@PathVariable String instanceId) {
    workflowClient.resumeWorkflow(instanceId, "Resumed through the API");
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/terminate/{instanceId}")
  public ResponseEntity<Void> terminate(@PathVariable String instanceId) {
    workflowClient.terminateWorkflow(instanceId, null);
    return ResponseEntity.accepted().build();
  }

  // Only add this endpoint when the workflow calls waitForExternalEvent.
  @PostMapping("/raise-event/{instanceId}/{eventName}")
  public ResponseEntity<?> raiseEvent(
      @PathVariable String instanceId, @PathVariable String eventName, @RequestBody Object payload) {
    WorkflowState state = workflowClient.getWorkflowState(instanceId, false);
    if (!exists(state)) {
      return ResponseEntity.notFound().build();
    }
    workflowClient.raiseEvent(instanceId, eventName, payload);
    return ResponseEntity.accepted().build();
  }

  // getWorkflowState returns a placeholder state, not null, for an unknown instance id:
  // its workflow id and name are empty and its runtime status reads RUNNING.
  private static boolean exists(WorkflowState state) {
    return state != null && state.getWorkflowId() != null && !state.getWorkflowId().isEmpty();
  }

  // An instance that has not finished cannot be scheduled again under the same id.
  private static boolean isActive(WorkflowState state) {
    if (!exists(state)) {
      return false;
    }
    WorkflowRuntimeStatus status = state.getRuntimeStatus();
    return status == WorkflowRuntimeStatus.RUNNING
        || status == WorkflowRuntimeStatus.PENDING
        || status == WorkflowRuntimeStatus.SUSPENDED
        || status == WorkflowRuntimeStatus.CONTINUED_AS_NEW;
  }
}
```

### Key points

- Constructor injection with a `final` field; never field `@Autowired`.
- `/start` binds the body to `<WorkflowInput>` and uses its id component (`input.id()`, or the entity id the
  input names, such as `input.shipmentId()`) as the instance id, so the status of a run is at `/status/<id>`.
- `/start` answers 409 Conflict, with the instance id in the body, when an instance with that id is still
  `RUNNING`, `PENDING`, `SUSPENDED` or `CONTINUED_AS_NEW`, the non-terminal values of the SDK's
  `WorkflowRuntimeStatus` (`CONTINUED_AS_NEW` marks a run that called `continueAsNew` and has not restarted
  yet). Without the check the runtime rejects the schedule
  (`ALREADY_EXISTS: an active workflow with ID '<id>' already exists`), which reaches the client as a 500.
  `isActive` calls `exists` first, because `getWorkflowState` reports an unknown id as `RUNNING`. Scheduling
  with the id of a finished instance (`COMPLETED`, `FAILED`, `TERMINATED` or `CANCELED`, the terminal values)
  starts a new run under the same id.
  Two concurrent starts with the same new id can still race; the loser gets the runtime's error.
- `/start` checks only when the input has an id: `getWorkflowState(null, ...)` throws, while
  `scheduleNewWorkflow` with a `null` id generates one.
- `scheduleNewWorkflow(<WorkflowName>.class, ...)` schedules by the workflow's canonical class name, the name
  `@EnableDaprWorkflows` registered it under.
- `/status` uses `getWorkflowState(instanceId, true)` and reads the output with
  `readOutputAs(<WorkflowOutput>.class)` once the run is `COMPLETED`. It answers 404 for an unknown id:
  `getWorkflowState` never returns `null` for one, but a state whose workflow id is empty.
- Never use `getInstanceState`, `waitForInstanceCompletion`, `WorkflowInstanceStatus` or `purgeInstance`.
- `pause`, `resume` and `terminate` answer 202 Accepted.
- `/raise-event` binds the body as `Object` and passes it on, so one endpoint serves every event; the workflow
  deserializes it into the record it passes to `waitForExternalEvent`. It checks the instance first, because
  `raiseEvent` on an unknown id throws (`no such instance exists`), which would be a 500. Remove the endpoint
  when the workflow waits for no external event.

## Adding to an existing project

- `pom.xml`: import `io.dapr.spring:dapr-spring-bom` 1.19.1 in `dependencyManagement` and add
  `io.dapr.spring:dapr-spring-boot-starter` without a version, as in
  [java-workflow-project.md](java-workflow-project.md). Keep the project's own dependencies.
- Add `@EnableDaprWorkflows` to the existing `@SpringBootApplication` class, once. Never add a second
  application class. Exception: when the project has slice tests (`@WebMvcTest`, `@DataJpaTest`, `@JsonTest`
  or another `@...Test` imported from an `org.springframework.boot` package whose name contains
  `test.autoconfigure`), put it on a new `@Configuration`
  class in the application's package instead. A slice test loads the application class but none of the Dapr
  autoconfiguration, so `@EnableDaprWorkflows` there fails the test context with `No qualifying bean of type
  'io.dapr.workflows.runtime.WorkflowRuntimeBuilder'`; slice tests skip a separate `@Configuration` class
  (`references/java/gotchas.md` §9):

  ```java
  package <javaPackage>;

  import io.dapr.spring.workflows.config.EnableDaprWorkflows;
  import org.springframework.context.annotation.Configuration;

  @Configuration
  @EnableDaprWorkflows
  public class DaprWorkflowConfiguration {
  }
  ```
- A `@WebMvcTest` that names no controllers loads every `@Controller`, including the new workflow controller,
  and then fails with `No qualifying bean of type 'io.dapr.workflows.client.DaprWorkflowClient'`: the bean
  comes from the starter's autoconfiguration, which slices exclude, wherever `@EnableDaprWorkflows` sits. Such
  a test needs a `@MockitoBean DaprWorkflowClient` field or its controllers listed
  (`@WebMvcTest(<Controller>.class)`); add-workflow-java flags it in the plan instead of editing the test.
- Put the workflow, activities, records and controller in the application's package or a sub-package of it,
  so component scanning finds them. When that package already has a `StatusResponse` class, use a new
  sub-package for the workflow code.
- Map the endpoints under `/workflows/<workflow-route>` so they cannot collide with the project's own routes:
  add `@RequestMapping("/workflows/<workflow-route>")` (from `org.springframework.web.bind.annotation`) to
  the controller class and keep the method mappings as they are. Root-level `/start` and `/status` are only
  for new projects.
- Keep the project's existing `application.properties` (or `application.yml`); add `server.port` only when it
  has none.

## Starting the workflow from an existing endpoint

Use this when the user agreed that an existing endpoint (for example `POST /loans`) should also start the
workflow. Change only that handler; keep its route, its existing work and its response. Add
`DaprWorkflowClient` as a constructor parameter and `final` field, then schedule after the existing work
succeeded:

```java
@RestController
@RequestMapping("/loans")
public class LoanController {

  private final LoanService loans;
  private final DaprWorkflowClient workflowClient;

  public LoanController(LoanService loans, DaprWorkflowClient workflowClient) {
    this.loans = loans;
    this.workflowClient = workflowClient;
  }

  @PostMapping
  public ResponseEntity<LoanApplication> create(@RequestBody LoanApplication application) {
    LoanApplication created = loans.add(application);

    workflowClient.scheduleNewWorkflow(
        LoanReviewWorkflow.class, new LoanReviewInput(created.id(), created.applicant()), created.id());

    return ResponseEntity.created(URI.create("/loans/" + created.id())).body(created);
  }
}
```

### Key points

- Schedule only after the existing work succeeded, so a rejected request (validation error, exception) never
  starts a workflow.
- Use the entity's own id as the instance id. The workflow's status is then at
  `/workflows/<workflow-route>/status/<entity id>`. The instance id is a `String`: when the entity id has
  another type (`long`, `Long`, `UUID`), pass `String.valueOf(created.id())` (and use it in the workflow
  input when that carries a `String` id). `String.valueOf` turns a `null` reference into the text `"null"`,
  so convert only after the null check below.
- Keep the status code and body exactly as they were; clients of the existing endpoint must not notice the
  change apart from the workflow running.
- When the entity id can repeat (the client sends it, or the handler updates an existing entity), an instance
  with that id may still be active, and `scheduleNewWorkflow` then throws `StatusRuntimeException`
  (`ALREADY_EXISTS`) after the existing work ran: a 500 the client would notice. Guard the call with the
  `/start` route's check and skip scheduling while the instance is active: copy the `exists` and `isActive`
  helpers into the controller and wrap the call in
  `if (created.id() != null && !isActive(workflowClient.getWorkflowState(String.valueOf(created.id()), false))) { ... }`.
  `getWorkflowState` throws on a null id, so keep the null check for a reference-type id (`String`, `Long`,
  `UUID`). Drop it for a primitive id (`long`: `created.id() != null` does not compile) or one the handler
  set before this point. A server-generated id needs no guard.
- The endpoint now needs the Dapr sidecar. Tests that call it over HTTP need a running sidecar or a mocked
  `DaprWorkflowClient` bean; that is why the default answer to the question is "no" when such tests exist.
