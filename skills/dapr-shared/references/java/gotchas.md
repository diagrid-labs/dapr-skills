# Java (Spring Boot) SDK Gotchas

Findings from two hand-built reference projects: a workflow app and a two-app pub/sub app (publisher,
subscriber with declarative, programmatic and streaming variants). They were built and run on 2026-11-24
against Spring Boot 4.0.8, the Dapr Spring BOM 1.19.1, Dapr CLI 1.19.1 and runtime 1.19.2, with Maven
3.9.9 on JDK 23 compiling with `--release 17`. Each entry says what was run or which SDK source file
(tag `v1.19.1`) it comes from, then the rule the Java templates follow.

---

## 1. Single-event subscriber responses (declarative and programmatic)

**Finding.** The SDK has no response type for one event; the only status enum is for bulk subscribe
(`BulkSubscribeAppResponseStatus`). The app returns its own record, serialized as `{"status": "..."}`.
What Dapr did with each response, with the inbound resiliency policy from
[dapr-pubsub-resiliency.md](../../dapr-pubsub-resiliency.md) (constant 5s, `maxRetries: 5`) and a
dead-letter topic on the subscription:

| Handler response | Observed result |
|---|---|
| HTTP 200, `{"status": "SUCCESS"}` | Handled once. |
| Exception thrown (Spring answers 500) | Delivered 6 times, 5s apart, then sent to the dead-letter topic. |
| HTTP 200, `{"status": "RETRY"}` | Delivered 6 times, 5s apart, like an exception (then expired, because it was published with the template; see 2). |
| HTTP 200, `{"status": "DROP"}` | Not redelivered. Sent to the dead-letter topic at once (sidecar log: `DROP status returned from app`). |
| Body cannot bind to the record (Spring answers 400) | Treated as retriable: delivered 6 times, then dead-lettered. |

So DROP is **not** "discarded": when the subscription has a dead-letter topic, a dropped message lands
there immediately. The same was seen for both subscription types.

A routing rule whose CEL cannot evaluate the payload (`int(event.data.priority)` on the string `"high"`)
never reaches the app: the sidecar logs `error finding matching route ... type conversion error` and
dead-letters the message.

**Rule.**
- Return 200 with `{"status": "SUCCESS"}` on success, throw on a transient error, and return 200 with
  `{"status": "DROP"}` for a message that can never succeed. Say in the generated README that a dropped
  message goes to the dead-letter topic.
- Add a `@RestControllerAdvice` that maps `HttpMessageNotReadableException` to 200 `{"status": "DROP"}`.
  Without it a malformed message is retried for the whole policy before it is dead-lettered. Verified:
  with the advice, an unparseable `scannedAt` was dropped once and dead-lettered.
- Never return 404 from a subscription route: Dapr drops the message (from `skills/dapr-shared/dapr-pubsub-subscription.md:59`, not rerun here).

## 2. `DaprMessagingTemplate` publishes every message with a 10-second TTL

**Finding.** `DaprMessagingTemplate` hard-codes `ttlInSeconds=10` on every publish
(`dapr-spring/dapr-spring-messaging/src/main/java/io/dapr/spring/messaging/DaprMessagingTemplate.java:44` and `:74`). Neither `send` nor
the `newMessage(...)` builder can change it. Observed:

- A message published with the template whose handler kept throwing was delivered 6 times over 25s,
  then the sidecar logged `dropping expired pub/sub event ... as of <publish time + 10s>`. It was **not**
  dead-lettered.
- A message published while the streaming subscriber was stopped was dropped as expired when the
  subscriber came back about 45s later.
- The same failing message published with `DaprClient.publishEvent(pubsubName, topic, event).block()`
  (no TTL) was delivered 6 times and then dead-lettered, as expected.

**Rule.** Never use `DaprMessagingTemplate`. Publish with the autoconfigured `DaprClient`
(`publishEvent(...).block()`), taking the pub/sub name from `dapr.pubsub.name` through
`DaprPubSubProperties`.

## 3. Streaming subscriptions (`DaprPreviewClient.subscribeToTopic`)

**Finding.** `subscribeToTopic(pubsub, topic, deadLetterTopic, TypeRef<T>)` returns a `Flux<T>` built
with `Flux.create`; disposing it completes the gRPC stream (`sdk/src/main/java/io/dapr/client/DaprClientImpl.java:635-653`).
The SDK emits each event to the subscriber and only then sends the ack
(`sdk/src/main/java/io/dapr/internal/subscription/EventSubscriberStreamObserver.java:159-167`). Observed, with a dead-letter
topic set:

- **Handler returns normally:** the SDK acks SUCCESS, whatever the handler decided. A handler that
  "drops" an event (logs and returns) is acked SUCCESS and the event is not dead-lettered.
- **Body cannot be deserialized:** the SDK acks DROP (`:169-178`), so the event is dead-lettered
  at once, and then the `Flux` errors and the subscription ends. Later events on that topic are not
  delivered until the app subscribes again.
- **Handler throws:** Reactor cancels the `Flux`, which completes the gRPC stream before any ack is sent;
  the SDK's RETRY ack then fails with `Stream is already completed` (`:180-196`). The sidecar logs
  `stream closed`, retries per the resiliency policy against `no streamer subscribed`, and leaves the
  message pending in Redis (`XINFO GROUPS` showed `pending 1`). Redis redelivered it about 60s later,
  the handler threw again, and the cycle repeated. The message was never dead-lettered, and later
  events were not delivered while no stream was open. This also happened with `retryWhen` in place
  but no catch in the handler (`run-streaming-3`): the stream reopened, but the message was
  redelivered and threw again, a poison loop.

The app cannot choose RETRY or DROP for an event it received.

**Rule.**
- Run the handler in `.doOnNext(...)` wrapped in `try`/`catch (RuntimeException e)` that logs the
  failure. Never let an exception escape: it turns the event into a poison message.
- Add `.retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30)).transientErrors(true))`
  before `.subscribe()`, on the topic stream and the dead-letter stream, so a deserialization failure (or a
  lost connection) opens a new stream. `transientErrors(true)` resets the backoff after an event arrives;
  without it the delay never resets, and with several poison messages reconnects grew to 25-50s while
  messages sat pending.
  Verified: after an undeserializable event was dead-lettered, the stream reopened about one second later
  and the next event was handled.
- Say plainly in the skill and the README: the preview API acks every event it hands to the app, a
  failed handler loses the event, and only a body that cannot be deserialized is dead-lettered.
- `DaprPreviewClient` is not autoconfigured. Declare it as a bean built from the autoconfigured
  `DaprClientBuilder` (`daprClientBuilder.buildPreviewClient()`), so it shares the connection settings and
  the Jackson 3 serializer of the `DaprClient` bean
  (`dapr-spring/dapr-spring-boot-autoconfigure/src/main/java/io/dapr/spring/boot/autoconfigure/client/DaprClientAutoConfiguration.java:53`). Start the subscriptions from
  a `SmartLifecycle` bean and dispose them in `stop()`.
- The streaming subscriber has no `appPort` in `dapr.yaml`; the sidecar then logs
  `App channel is not initialized`, which is expected.

## 4. Records as workflow input, output and event payloads

**Finding.** Workflow and activity payloads are serialized by durabletask's own static Jackson 2 mapper
(`durabletask-client/src/main/java/io/dapr/durabletask/JacksonDataConverter.java:25-27`, `com.fasterxml` with `findAndAddModules()`), not
by Spring's Jackson 3 `JsonMapper`. The resolved classpath has Jackson 2.21.7 with
`jackson-datatype-jsr310` and Jackson 3.1.5. Verified by a run: top-level records round-tripped as
workflow input (`ShipmentRequest`), activity output (`ParcelLabel` with an `Instant` field), activity input
holding another record (`DispatchRequest(ParcelLabel, String)`), external event payload
(`PickupConfirmation`), and workflow output read with `state.readOutputAs(ShipmentResult.class)`.

**Rule.** Use top-level records for every workflow payload. Use only `com.fasterxml.jackson.annotation`
annotations on them (from source, not run: both Jackson versions read those) and nothing from `tools.jackson`. `java.time`
fields work.

## 5. Calling activities by class name

**Finding.** `@EnableDaprWorkflows` registers each `Workflow` and `WorkflowActivity` bean under
`instance.getClass().getCanonicalName()` (`sdk-workflows/src/main/java/io/dapr/workflows/runtime/WorkflowRuntimeBuilder.java:257-258` and
`:335-336`); `scheduleNewWorkflow(Class, ...)` also uses the canonical name (`sdk-workflows/src/main/java/io/dapr/workflows/client/DaprWorkflowClient.java:174`).
Verified: `ctx.callActivity(RegisterParcelActivity.class.getName(), request, ParcelLabel.class).await()`
resolved for a top-level `@Component` activity (startup log: `Registered Activity:
com.example.parcelshipping.RegisterParcelActivity`). For a nested class `getName()` returns `Outer$Inner`
while the registration uses `Outer.Inner`, so the call would not resolve (from source, not run).

**Rule.** Workflows and activities are top-level `@Component` classes, called with
`<ActivityName>.class.getName()`.

## 6. `application.properties`, not `application.yml`

**Finding.** The reference apps used `application.properties` throughout (`server.port`,
`spring.application.name`, `dapr.pubsub.name`, and app keys such as `app.topic` read by `@Topic`
placeholders). Nothing needed YAML. The SDK's own Spring Boot examples use `application.properties`.

**Rule.** Generate `application.properties` everywhere. Set `server.port` to the app's `appPort` in
`dapr.yaml`; generate no `dapr.client.*` properties. In every run the apps reached their sidecars with none set, so
the SDK picked up the ports `dapr run` exports (`DAPR_HTTP_PORT`, `DAPR_GRPC_PORT`).

## 7. More workflow findings

- **Unknown instance ids.** `getWorkflowState(id, ...)` does not return `null` for an id that does not
  exist: it returns a state with an empty workflow id and name, whose runtime status reads `RUNNING`
  (observed). `raiseEvent` on an unknown id throws `StatusRuntimeException: UNKNOWN: no such instance
  exists` (observed, a 500 if unhandled). Treat a state as missing when it is `null` or its
  `getWorkflowId()` is empty, and answer 404 from the status and raise-event endpoints.
- **Reusing an instance id.** `scheduleNewWorkflow` with the id of a COMPLETED instance started a new run
  under the same id (observed). Match the .NET start endpoint (`skills/dapr-shared/dotnet-workflow-endpoints.md`): use the request's own entity id as the instance id (`scheduleNewWorkflow(Workflow.class, request, request.parcelId())` in the reference app; in the templates, `scheduleNewWorkflow(<WorkflowName>.class, input, input.id())` with the id component of `<WorkflowInput>`). Before scheduling, read the state of that id and answer 409 Conflict when it is `RUNNING`, `PENDING` or `SUSPENDED` (the templates also include `CONTINUED_AS_NEW`, the remaining non-terminal value of `WorkflowRuntimeStatus` in 1.19.1; not observed): `scheduleNewWorkflow` on an active id throws `StatusRuntimeException: ALREADY_EXISTS: ... an active workflow with ID '<id>' already exists` (observed for RUNNING and SUSPENDED, a 500 if unhandled). Check the id for `null` first: `getWorkflowState(null, ...)` throws a `NullPointerException` (observed). Verified on 2026-11-24 against runtime 1.19.2: a second start of a running instance answered 409, and a start after the first run COMPLETED answered 200 with a new run.
- **External event timeout.** `ctx.waitForExternalEvent(name, Duration, Class).await()` throws
  `io.dapr.durabletask.TaskCanceledException` when the timeout expires (verified with a 30s timeout). Wrap the `.await()` in `try`/`catch (TaskCanceledException e)`, log it and `ctx.complete(...)` with a timed-out result such as `PICKUP_TIMED_OUT`, as `ShipmentWorkflow` does; never let the exception fail the workflow.
- **Retry policy.** `new WorkflowTaskOptions(WorkflowTaskRetryPolicy.newBuilder()...build())` passed to
  `callActivity` retried a failing activity, which succeeded on attempt 2 (verified). Pass a `WorkflowTaskOptions` with a `WorkflowTaskRetryPolicy` to `callActivity` for every activity that can fail transiently.
- **Raise-event body.** Binding the request body as `Object` and passing it to `raiseEvent` works for any
  event: the workflow deserializes it into the record passed to `waitForExternalEvent` (verified). Bind the raise-event body as `Object` so one endpoint serves every event.
- **Logging.** `ctx.getLogger()` logged the workflow's start line once per run, although the workflow
  replayed after each activity (verified). Log from workflow code only through `ctx.getLogger()`.

## 8. More pub/sub findings

- `@Topic(name = "${app.topic}", pubsubName = "${dapr.pubsub.name}", deadLetterTopic = "${...}",
  rule = @Rule(match = "...", priority = 1))` placeholders resolve, and the starter serves
  `GET /dapr/subscribe` with the rule, the default route and the dead-letter topic (verified). Use these `@Topic` placeholders for the topic, pub/sub name and dead-letter topic rather than hard-coded strings.
- Spring MVC's Jackson 3 binds `@RequestBody CloudEvent<T>` to a record, including an `Instant` field
  (verified). Declare subscriber handler parameters as `@RequestBody CloudEvent<T>` with `T` a record.
- `appLogDestination: fileAndConsole` writes `.dapr/logs/` inside each app folder, so the generated
  `.gitignore` must list `.dapr/`.

## 9. Findings while writing the workflow templates

- **Broad catches.** `Task.await()` on a task with no result yet throws
  `io.dapr.durabletask.interruption.OrchestratorBlockedException` (a `RuntimeException`) with the message
  "The orchestrator is blocked and waiting for new inputs. This Throwable should never be caught by user
  code." (from the `durabletask-client` 1.19.1 bytecode, `TaskOrchestrationExecutor`; not run). **Rule.**
  In workflow code catch only `TaskFailedException` and `TaskCanceledException`, never `Exception` or
  `Throwable`.
- **Where `DaprWorkflowClient` comes from.** The bean is declared by the starter's
  `DaprClientAutoConfiguration.daprWorkflowClient(...)` (`dapr-spring-boot-autoconfigure` 1.19.1), not by
  `@EnableDaprWorkflows` (from the jar's class signatures). **Rule.** Take it through the constructor; declare
  no `DaprWorkflowClient` bean of your own.
- **Pattern code.** The fan-out (`ctx.allOf`), saga (`catch (TaskFailedException e)`), monitor
  (`createTimer` plus `continueAsNew`), child workflow (`callChildWorkflow` with an instance id and a retry
  policy) and external-event examples in [patterns.md](patterns.md) and [error-handling.md](error-handling.md)
  compiled with `mvn -q -DskipTests package` against the 1.19.1 BOM (compiled, not run).
- **Slice tests in an existing project.** With `@EnableDaprWorkflows` on the `@SpringBootApplication` class, a
  `@WebMvcTest` that passed before failed to load its context: `No qualifying bean of type
  'io.dapr.workflows.runtime.WorkflowRuntimeBuilder'` (observed, Spring Boot 4.0.5, `dapr-spring-bom` 1.19.1).
  The slice reads the application class's annotations but excludes the Dapr autoconfiguration. Moving the
  annotation to its own `@Configuration` class fixed it: the slice skips that class, and the app still
  registered and ran the workflow under `dapr run`. A full `@SpringBootTest` context loads either way, without
  a sidecar; the worker logs `The sidecar at address 127.0.0.1:50001 is unavailable. Will continue retrying.`
  **Rule.** In a project with slice tests, put `@EnableDaprWorkflows` on a separate `@Configuration` class.
  That does not cover a `@WebMvcTest` that names no controllers: it loads every `@Controller`, including the
  new workflow controller, and failed with `No qualifying bean of type
  'io.dapr.workflows.client.DaprWorkflowClient'` (observed, Spring Boot 4.0.8, `dapr-spring-bom` 1.19.1, with
  `@EnableDaprWorkflows` on a separate `@Configuration` class). The bean comes only from
  `DaprClientAutoConfiguration`, which the slice excludes. Adding a `@MockitoBean DaprWorkflowClient` field, or
  listing the controllers (`@WebMvcTest(InvoiceController.class)`), made the test pass again (observed). **Rule.**
  add-workflow-java does not edit tests; its plan names each bare `@WebMvcTest` with this fix as a Risk.
- **Unit tests.** Mockito 5 from `spring-boot-starter-test` mocks `WorkflowContext`, the abstract `Task`, and
  `TaskFailedException` / `FailureDetails` (which have no public constructors). Tests of an activity, a chained
  workflow and a saga's compensation branch ran green with `mvn test` (see [testing.md](testing.md)).

## Open

- **Windows.** Whether `command: ["mvn", "spring-boot:run"]` starts under `dapr run -f .` on Windows
  (`mvn` resolving to `mvn.cmd`) is not yet verified on Windows.
  It worked on macOS.
