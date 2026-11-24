# Dapr Workflow Java SDK Reference (Spring Boot)

## Overview

The `create-workflow-java` skill builds a Spring Boot 4 application on the Dapr Spring Boot starter. A workflow
is a Spring `@Component` that implements `io.dapr.workflows.Workflow`; an activity is a `@Component` that
implements `io.dapr.workflows.WorkflowActivity`. `@EnableDaprWorkflows` registers both and starts the workflow
runtime, and the starter's autoconfiguration provides a `DaprWorkflowClient` bean for scheduling and managing
runs.

Like Python and .NET, the Java SDK has no sandbox: **you** keep workflow code deterministic.

Findings from the reference builds behind these rules, with the SDK source they come from, are in
[gotchas.md](gotchas.md).

## Dependencies

Maven only, with `spring-boot-starter-parent` 4.0.8 as the parent and `java.version` 17:

| Artifact | Version | How |
|---|---|---|
| `io.dapr.spring:dapr-spring-bom` | 1.19.1 | imported in `dependencyManagement` (`<type>pom</type>`, `<scope>import</scope>`) |
| `io.dapr.spring:dapr-spring-boot-starter` | from the BOM | dependency without a `<version>` |
| `org.springframework.boot:spring-boot-starter-webmvc` | from the parent | the management endpoints |
| `org.springframework.boot:spring-boot-starter-actuator` | from the parent | health endpoints |

The BOM resolves every `io.dapr` and `io.dapr.spring` artifact to 1.19.1. The full `pom.xml` is in
[java-workflow-project.md](../../java-workflow-project.md).

## Workflow

```java
@Component
public class GreetingWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      GreetingInput input = ctx.getInput(GreetingInput.class);
      GreetingOutput greeting = ctx.callActivity(
          SayHelloActivity.class.getName(), input, GreetingOutput.class).await();
      ctx.complete(greeting);
    };
  }
}
```

`create()` returns a `WorkflowStub`, a lambda the runtime runs (and replays) with a `WorkflowContext`. The
workflow ends with `ctx.complete(output)`.

## Activity

```java
@Component
public class SayHelloActivity implements WorkflowActivity {

  @Override
  public Object run(WorkflowActivityContext ctx) {
    GreetingInput input = ctx.getInput(GreetingInput.class);
    return new GreetingOutput("Hello, " + input.name() + "!");
  }
}
```

`GreetingInput` and `GreetingOutput` are top-level records (see [data-handling.md](data-handling.md)).

## Registration

```java
@SpringBootApplication
@EnableDaprWorkflows
public class Application {

  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
```

`@EnableDaprWorkflows` (package `io.dapr.spring.workflows.config`) registers every `Workflow` and
`WorkflowActivity` bean under `getClass().getCanonicalName()`. That is why workflows and activities are
top-level classes, called by `<Class>.class.getName()`: for a nested class `getName()` returns
`Outer$Inner` while the registration uses `Outer.Inner`.

## WorkflowContext

| Method | Use |
|---|---|
| `getInput(Class<V>)` | the workflow input |
| `callActivity(name, input, Class<V>)` | schedule an activity; `.await()` for its result |
| `callActivity(name, input, WorkflowTaskOptions, Class<V>)` | the same, with a retry policy |
| `callChildWorkflow(name, input, instanceId, Class<V>)` | run another workflow as a child |
| `waitForExternalEvent(name, Duration, Class<V>)` | wait for a raised event, with a timeout |
| `createTimer(Duration)` | a durable timer; `.await()` to sleep |
| `allOf(List<Task<V>>)` / `anyOf(Task<?>...)` | wait for all or the first of several tasks |
| `continueAsNew(input)` | restart with a new input and an empty history |
| `complete(output)` | finish with an output |
| `getCurrentInstant()` / `newUuid()` | replay-safe time and ids |
| `getLogger()` | a logger that logs once per run, not on every replay |
| `getInstanceId()` / `isReplaying()` | the run's id; whether the body is replaying |
| `isPatched(name)` | versioning a workflow already in flight |

## DaprWorkflowClient

Injected through the constructor of the controller (or any bean that starts workflows):

| Method | Use |
|---|---|
| `scheduleNewWorkflow(Class, input, instanceId)` | start a run; returns the instance id |
| `getWorkflowState(instanceId, true)` | status, with input and output; `readOutputAs(Class)` reads the output |
| `suspendWorkflow(instanceId, reason)` / `resumeWorkflow(instanceId, reason)` | pause and resume |
| `terminateWorkflow(instanceId, output)` | stop a run |
| `raiseEvent(instanceId, eventName, payload)` | deliver an external event |
| `waitForWorkflowCompletion(instanceId, Duration, true)` | block until a run ends (tests and tools, not endpoints) |

Use these `Workflow*` methods, not the older `getInstanceState`, `waitForInstanceCompletion`,
`WorkflowInstanceStatus` and `purgeInstance`.

## Configuration

`src/main/resources/application.properties` holds `spring.application.name` and `server.port`, which equals
`appPort` in `dapr.yaml`. Generate no `dapr.client.*` properties: under `dapr run` the SDK reads the exported
`DAPR_HTTP_PORT` and `DAPR_GRPC_PORT`.

## Run with Dapr

```yaml
apps:
  - appID: <app-id>
    appDirPath: <ProjectName>
    appPort: <app-port>
    command: ["mvn", "spring-boot:run"]
```

Start it with `dapr run -f .` from the folder that holds `dapr.yaml`.

## Common pitfalls

1. **Nested workflow or activity classes**: registered as `Outer.Inner`, called as `Outer$Inner`, so the call
   never resolves. Keep them top-level.
2. **Activity names as string literals**: a typo or a moved class breaks the call at runtime. Use
   `<Class>.class.getName()`.
3. **Forgetting `.await()`**: the activity is scheduled but its result never reaches the workflow.
4. **Catching `Exception` around `.await()`**: it also catches the SDK's internal
   `OrchestratorBlockedException`. Catch `TaskFailedException` or `TaskCanceledException`.
5. **`Instant.now()` or `UUID.randomUUID()` in a workflow**: different on replay. Use `ctx.getCurrentInstant()`
   and `ctx.newUuid()`.
6. **Spring Jackson annotations on payloads**: payloads go through the SDK's Jackson 2 mapper, so
   `tools.jackson` annotations are ignored.

## Additional reference files

- [determinism.md](determinism.md) — forbidden calls and their `ctx` replacements
- [patterns.md](patterns.md) — chaining, fan-out/fan-in, saga, human-in-the-loop, monitor, child workflows
- [error-handling.md](error-handling.md) — retry policies, `TaskFailedException`, compensation
- [data-handling.md](data-handling.md) — records, the Jackson 2 rule, payload size
- [testing.md](testing.md) — unit tests for activities and workflow logic
- [gotchas.md](gotchas.md) — findings from the reference builds
