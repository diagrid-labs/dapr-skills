# Activity Checklist — Java

Apply each rule below to every file in `activity_files` produced by `review-detect-target.md`. The "scope" of every rule is a class implementing `io.dapr.workflows.WorkflowActivity`, its `run(WorkflowActivityContext ctx)` method and its fields. DWF-ACT-014 also applies to the workflow classes in `workflow_files`, and DWF-ACT-015 to the records an activity reads with `ctx.getInput(<Type>.class)` or returns from `run`.

Rule source: see [`java-activity-class.md`](java-activity-class.md), [`java-models.md`](java-models.md), [`references/java/error-handling.md`](references/java/error-handling.md) and [`references/java/gotchas.md`](references/java/gotchas.md). SDK paths in the Source column are relative to [dapr/java-sdk](https://github.com/dapr/java-sdk) at tag `v1.19.1`.

## Rule id map

| Rule id | .NET | Python | Java |
| --- | --- | --- | --- |
| DWF-ACT-001 | applies | applies | applies |
| DWF-ACT-002 | applies | applies | applies |
| DWF-ACT-003 | applies | applies | applies |
| DWF-ACT-004 | applies | applies | applies |
| DWF-ACT-005 | applies | applies | not applicable to Java (`run` is synchronous and takes no cancellation token) |
| DWF-ACT-006 | applies | applies | applies |
| DWF-ACT-007 | applies | applies | applies |
| DWF-ACT-008 | applies | applies | not applicable to Java (`internal sealed`); see DWF-ACT-013 |
| DWF-ACT-009 | applies | applies | applies |
| DWF-ACT-010 | applies | applies | applies |
| DWF-ACT-011 | applies | applies | applies |
| DWF-ACT-012 | applies | reserved | not applicable to Java (no `async void`) |
| DWF-ACT-013 | reserved | reserved | applies |
| DWF-ACT-014 | reserved | reserved | applies |
| DWF-ACT-015 | reserved | reserved | applies |

## Rules

| Rule id | Severity | What to detect | Why it matters | Suggested fix | Source |
| --- | --- | --- | --- | --- | --- |
| DWF-ACT-001 | critical | `DaprWorkflowClient` injected into an activity (constructor parameter or field) or used in `run` | Activities must not orchestrate workflows directly; a started workflow is invisible to the parent's history and is started again every time the activity is retried or redelivered. | Return data from the activity and let the parent workflow call `ctx.callChildWorkflow(...)`. | `references/java/patterns.md` "Pattern 6: Child Workflows" |
| DWF-ACT-002 | critical | A side-effecting call in `run` (`RestClient` / `RestTemplate` / `WebClient` POST, PUT, PATCH or DELETE; a repository `save` / `delete`; `JdbcTemplate.update`; mail or payment SDK calls) with no idempotency key derived from the input | Activities execute at least once: a retry policy on `callActivity` runs the activity again for every failed attempt, and an app that stops after the activity ran but before its result was recorded runs it again. Without a key the side effect happens more than once. | Forward a stable key with the call: an id carried in the input record (for example generated in the workflow with `ctx.newUuid()`), or `ctx.getTaskExecutionId()`, which the SDK keeps the same across every retry attempt of one `callActivity`. Upsert rather than insert. | `references/java/error-handling.md` "Activity idempotency"; `durabletask-client/src/main/java/io/dapr/durabletask/TaskOrchestrationExecutor.java:420-422`; `sdk-workflows/src/main/java/io/dapr/workflows/WorkflowActivityContext.java:27` |
| DWF-ACT-003 | warning | `catch \((Exception\|Throwable\|RuntimeException)\b` in `run` with no rethrow and no failure result (an empty block, a comment only, or a fall-through to a success result) | Swallowing the exception turns a failure into a success: the retry policy never runs and the workflow carries on with a result that did not happen. | Rethrow (an exception thrown from `run` fails the activity and triggers the retry policy), or return a record that says the step failed. | `references/java/error-handling.md` "Overview", "Errors that retrying cannot fix" |
| DWF-ACT-004 | warning | Activity input or output type is `String`, `byte\[\]` or `InputStream` with no documented size cap | Inputs and outputs are persisted in the workflow history; oversized payloads slow every replay and break state-store limits. | Pass a pointer (an id, a blob URL) and store the body separately. | `references/java/data-handling.md` "Payload size" |
| DWF-ACT-005 | — | Not applicable to Java: `run(WorkflowActivityContext)` is synchronous and has no cancellation token. | — | — | `sdk-workflows/src/main/java/io/dapr/workflows/WorkflowActivity.java` |
| DWF-ACT-006 | warning | `Thread\.sleep\(` or `TimeUnit\.\w+\.sleep\(` in `run` of 5 minutes or more | Long blocking activities hold a worker thread and hide progress; a restart repeats the whole wait. | Split into smaller activities, or move the wait to `ctx.createTimer(...)` in the workflow. | `references/java/determinism.md` "Waiting" |
| DWF-ACT-007 | warning | A mutable `static` or instance field (not `final`, or a `final` mutable collection) written in `run`: `\b\w+\+\+`, `this\.\w+ =`, or `\.(put\|add\|remove\|clear)\(` on a field whose type is a `Map` or a collection (not on a client such as `RestClient.put()`) | The activity is a Spring singleton bean and is registered as one instance, so every concurrent and later call shares the field. | Keep per-call state in local variables; hold collaborators in `private final` fields set by the constructor. | `sdk-workflows/src/main/java/io/dapr/workflows/runtime/WorkflowRuntimeBuilder.java:335-336` |
| DWF-ACT-008 | — | Not applicable to Java (`internal sealed`); class shape is covered by DWF-ACT-013. | — | — | — |
| DWF-ACT-009 | warning | The type read with `ctx.getInput(...)`, or the value returned from `run`, is a primitive or boxed primitive, `String`, `Map`, `List` of primitives or `Object` instead of a record | Untyped payloads make the contract between workflow and activity implicit, and versioning and cross-language calls fragile. | Define a top-level `record` for the input and one for the output (see `java-models.md`). | `java-models.md` |
| DWF-ACT-010 | warning | `System\.out\.`, `System\.err\.`, `printStackTrace\(` in an activity | Bypasses the application's log pipeline and structured logging. | Use an SLF4J `Logger` (`LoggerFactory.getLogger(<ActivityName>.class)`). | `java-activity-class.md` |
| DWF-ACT-011 | warning | An injected bean (constructor parameter or field) whose class holds mutable per-call state: fields written in its methods without synchronization, or a non-thread-safe collection | Beans are singletons by default and shared by all concurrent activity calls, so per-call state leaks between them. | Keep per-call state local to `run`, make the bean stateless, or give it a `prototype` scope and obtain it per call. | `sdk-workflows/src/main/java/io/dapr/workflows/runtime/WorkflowRuntimeBuilder.java:335-336` (one registered instance); Spring's default `singleton` bean scope |
| DWF-ACT-012 | — | Not applicable to Java (no `async void`). | — | — | — |
| DWF-ACT-013 | critical | A class implementing `WorkflowActivity` that is nested (an inner or `static` member class, declared inside another class) or that is not annotated `@Component` (or `@Service`) | `@EnableDaprWorkflows` registers each activity bean under `getClass().getCanonicalName()`. For a nested class that is `Outer.Inner`, while `Inner.class.getName()` returns `Outer$Inner`, so `callActivity` never resolves. A class with no `@Component` is not a bean and is never registered at all. Either way the workflow cannot call it. | Make the activity a top-level `public` class annotated `@Component`, called with `<ActivityName>.class.getName()`. | `references/java/gotchas.md` §5; `WorkflowRuntimeBuilder.java:335-336`; `dapr-spring/dapr-spring-workflows/src/main/java/io/dapr/spring/workflows/config/DaprWorkflowsConfiguration.java:72-78` |
| DWF-ACT-014 | warning | `@Autowired` on a field (field injection) in an activity class or a workflow class | Field injection hides the dependency and leaves the field mutable in a singleton bean shared by every call; it also cannot be set in a plain unit test. | Take the dependency as a constructor parameter and keep it in a `private final` field. | `java-activity-class.md` "Key points" |
| DWF-ACT-015 | warning | An annotation imported from `tools\.jackson` (for example `tools.jackson.databind.annotation.JsonNaming`, `JsonSerialize`, `JsonDeserialize`) on a record used as an activity or workflow input or output | Workflow and activity payloads are serialized by durabletask's own Jackson 2 mapper (`com.fasterxml`), not by Spring's Jackson 3 mapper. It ignores `tools.jackson` annotations, so the stored JSON is not what the annotation asks for. | Use only `com.fasterxml.jackson.annotation` annotations (for example `@JsonProperty`) on workflow payloads. | `references/java/gotchas.md` §4; `references/java/data-handling.md` "Rule 2: Jackson 2 annotations only"; `durabletask-client/src/main/java/io/dapr/durabletask/JacksonDataConverter.java:25-27` |

## Confidence notes

- DWF-ACT-002 — Treat as satisfied if any idempotency key is passed: an `Idempotency-Key` header, an id carried in the input record and sent with the call, a key built from `ctx.getTaskExecutionId()`, or an upsert keyed by an input id (`PUT /entries/{id}`). Read-only calls (`GET`, queries) are not side effects and are out of scope.
- DWF-ACT-003 — A `catch` that logs and rethrows (or wraps and throws) is fine. A `catch` of a specific exception that returns a failure record is fine. Only flag plain swallows.
- DWF-ACT-004 — A record with `String` components is not this rule, even when it is named like a payload body (the default template's `record <ActivityInput>(String data)` and `record <ActivityOutput>(String processedData)` are clean). Only a bare `String`, `byte[]` or `InputStream` used directly as the input or output type is flagged.
- DWF-ACT-006 — Heuristic only; downgrade to "Please verify" when the wait is intentional (for example rate-limit backoff).
- DWF-ACT-007 — `private static final Logger` and `private final` collaborator fields set in the constructor are not mutable state: never report them.
- DWF-ACT-009 — `run` is declared to return `Object`; judge the type of the value actually returned, not the declared return type. An activity that has no output (returns `null` and is called without an output type) is fine.
- DWF-ACT-013 — An activity annotated `@ActivityMetadata(name = "...")` is registered under that name instead; report it only when the workflow calls it by a different name. A class with no `@Component` is still registered, and is not this rule, when a `@Bean` method returns an instance of it (`@EnableDaprWorkflows` registers every `WorkflowActivity` bean, `DaprWorkflowsConfiguration.java:72`), or when the app registers it itself with `WorkflowRuntimeBuilder.registerActivity(...)`; a nested class registered either way is still this rule. Report each class once, at its class declaration line.
- DWF-ACT-015 — Cite the annotation line in the record's file. Annotations from `com.fasterxml.jackson.annotation` are read by both mappers and are not this rule.

## Cross-reference

Rules that detect non-determinism inside activities are **not** in scope here — those are intentional in activities. This skill assumes the corresponding workflow file has been or will be reviewed by `review-workflow-determinism`. Only DWF-ACT-014 reports inside a workflow class, and only DWF-ACT-015 reports inside a record file.
