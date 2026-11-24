# Determinism Checklist — Java

Apply each rule below to every file in `workflow_files` produced by `review-detect-target.md`. The "scope" of every rule is the body of the `WorkflowStub` lambda that `create()` returns on a class implementing `io.dapr.workflows.Workflow` (or an overridden `run(WorkflowContext ctx)`), plus any method of the class called from it. Findings inside `WorkflowActivity` classes, controllers and other beans are out of scope for this skill.

Rule source: see [`java-workflow-class.md`](java-workflow-class.md) — section "Workflow determinism", and [`references/java/determinism.md`](references/java/determinism.md). SDK paths in the Source column are relative to [dapr/java-sdk](https://github.com/dapr/java-sdk) at tag `v1.19.1`.

## Rule id map

| Rule id | .NET | Python | Java |
| --- | --- | --- | --- |
| DWF-DET-001 | applies | applies | applies |
| DWF-DET-002 | applies | applies | applies |
| DWF-DET-003 | applies | applies | applies |
| DWF-DET-004 | applies | applies | applies |
| DWF-DET-005 | applies | applies | applies |
| DWF-DET-006 | applies | applies | applies |
| DWF-DET-007 | applies | applies | applies |
| DWF-DET-008 | applies | applies | applies |
| DWF-DET-009 | applies | applies | applies |
| DWF-DET-010 | applies | applies | applies |
| DWF-DET-011 | applies | applies | applies |
| DWF-DET-012 | applies | applies | applies |
| DWF-DET-013 | applies | applies | applies |
| DWF-DET-014 | applies | applies | not applicable to Java (no `async void`) |
| DWF-DET-015 | applies | applies | applies |
| DWF-DET-016 | reserved | reserved | applies |
| DWF-DET-017 | reserved | reserved | applies |

## Rules

| Rule id | Severity | What to detect (regex / pattern in workflow scope) | Why it fails | Suggested fix | Source |
| --- | --- | --- | --- | --- | --- |
| DWF-DET-001 | critical | `Instant\.now\(`, `LocalDate(Time)?\.now\(`, `ZonedDateTime\.now\(`, `System\.currentTimeMillis\(`, `new Date\(\)`, `Clock\.` | Wall-clock reads return a different value on every replay, so the body takes different branches or passes different inputs than the history recorded. | Use `ctx.getCurrentInstant()`. | `references/java/determinism.md` "Time"; `sdk-workflows/src/main/java/io/dapr/workflows/WorkflowContext.java:66` |
| DWF-DET-002 | critical | `UUID\.randomUUID\(` | Generates a fresh value per replay, breaking deterministic history matching. | Use `ctx.newUuid()`. | `references/java/determinism.md` "Ids and random values"; `WorkflowContext.java:526` |
| DWF-DET-003 | critical | `new (Secure)?Random\(`, `Math\.random\(`, `ThreadLocalRandom` | Random sources produce different values per replay. | Generate the value in an activity and return it as the activity output. | `references/java/determinism.md` "Forbidden calls" |
| DWF-DET-004 | critical | `Thread\.sleep\(`, `TimeUnit\.\w+\.sleep\(` | Blocks the workflow worker thread and records nothing in the history; the wait is repeated on every replay and lost on a restart. | Use `ctx.createTimer(Duration...).await()`. | `references/java/determinism.md` "Waiting"; `WorkflowContext.java:338` |
| DWF-DET-005 | critical | `new Thread\(`, `Executor`, `CompletableFuture`, `\.parallelStream\(`, `@Async` | Escapes the workflow scheduler; the work is invisible to the history and may run again on every replay. | Schedule activities and wait for them with `ctx.allOf(tasks).await()`. | `references/java/determinism.md` "Parallel work"; `WorkflowContext.java:275` |
| DWF-DET-006 | critical | `RestClient`, `RestTemplate`, `WebClient`, `HttpClient`, `URL\(.*\)\.open` | Direct network I/O inside a workflow is non-deterministic and runs once per replay. | Move the call into an activity. | `references/java/determinism.md` "Forbidden calls" |
| DWF-DET-007 | critical | `Files\.`, `File(Input\|Output)Stream`, `FileReader`, `FileWriter` | File I/O is non-deterministic and runs once per replay. | Move the call into an activity. | `references/java/determinism.md` "Forbidden calls" |
| DWF-DET-008 | critical | `JdbcTemplate`, `EntityManager`, `\w+Repository\.`, `MongoTemplate`, `RedisTemplate` | Database calls are side-effecting and return different results between the original run and a replay. | Move the call into an activity that takes the repository through its constructor. | `references/java/determinism.md` "Forbidden calls" |
| DWF-DET-009 | critical | `System\.getenv\(`, `System\.getProperty\(`, `Environment\.getProperty\(`, a `@Value` field read in the workflow body | Configuration can change between the original run and a replay (for example after a redeploy). | Pass the value in the workflow input, or read it inside an activity. | `references/java/determinism.md` "Forbidden calls" |
| DWF-DET-010 | warning | A `for` / `forEach` over a `HashMap`, `HashSet`, or the `.keySet()` / `.values()` / `.entrySet()` of one, that schedules `ctx.callActivity` / `ctx.callChildWorkflow` / timers | Hash iteration order is not guaranteed, so a replay can schedule tasks in a different order than the history. | Iterate a `List` from the input, or sort the keys first. | `references/java/determinism.md` "Forbidden calls" |
| DWF-DET-011 | warning | A field of the workflow class (static or instance, not `final` constants) written inside the workflow body: `\b\w+\+\+`, `this\.\w+ =`, or an assignment to a field name | The workflow is a Spring singleton bean shared by every run, and the body runs again on every replay, so the field carries state across replays and across instances. | Use local variables inside the lambda; carry state in the input, activity outputs or `continueAsNew` input. | `references/java/determinism.md` "Forbidden calls"; `sdk-workflows/src/main/java/io/dapr/workflows/runtime/WorkflowRuntimeBuilder.java:257-258` (one registered instance) |
| DWF-DET-012 | warning | `System\.out\.`, `System\.err\.`, or an SLF4J `Logger` field (`LoggerFactory\.getLogger`) used in the workflow body and not guarded by `if \(!ctx\.isReplaying\(\)\)` | Logged again on every replay, multiplying log volume and confusing diagnostics. | Log through `ctx.getLogger()`, which logs only when the body is not replaying. | `references/java/determinism.md` "Logging"; `WorkflowContext.java:40-45` |
| DWF-DET-013 | critical | `while \(true\)`, `for \(;;\)`, or a loop whose condition never changes, that schedules activities, child workflows or timers in workflow scope and has no exit path. Bounded loops (retry up to N times, iterate over an input list) are fine. | Eternal loops grow the workflow history without bound and eventually exceed state-store limits. | Handle one iteration per run and end it with `ctx.continueAsNew(nextInput)`, then `return`. `continueAsNew` must be the last workflow action. | `references/java/determinism.md` "Loops", `references/java/patterns.md` "Pattern 5: Monitor"; `WorkflowContext.java:485-513` |
| DWF-DET-014 | — | Not applicable to Java: the Java SDK has no `async void` equivalent. | — | — | — |
| DWF-DET-015 | info | `System\.nanoTime\(` | Timing measurements drift between the original run and a replay. | Capture timestamps with `ctx.getCurrentInstant()` at boundaries instead. | `WorkflowContext.java:66` |
| DWF-DET-016 | critical | A catch whose type, or any alternative of a multi-catch, is `Exception`, `Throwable` or `RuntimeException` (also fully qualified, e.g. `java.lang.Exception`; for example `catch (IOException \| RuntimeException e)`) whose `try` block contains `.await()`, directly or through a method of the workflow class that the `try` block calls | `await()` on a task with no result yet stops the body by throwing `OrchestratorBlockedException`, a `RuntimeException` that "must never be caught by user code". A broad catch swallows it: the body carries on as if the call had returned, runs the catch branch (often completing the run as failed) and the workflow does not wait for the activity. | Catch `TaskFailedException` (a failed activity or child workflow) or `TaskCanceledException` (an external event or timer timeout) instead. | `references/java/determinism.md` "Catching exceptions"; `references/java/gotchas.md` §9; `durabletask-client/src/main/java/io/dapr/durabletask/interruption/OrchestratorBlockedException.java:18-27` |
| DWF-DET-017 | warning, reported under Please verify | A bean injected through the workflow class's constructor (a `final` field set in the constructor, or a constructor parameter) that is called inside the workflow body | Workflows call activities only. A bean call runs again on every replay and outside the history; services, repositories and clients usually do I/O, and their results can differ between runs. | Move the call into an activity that takes the bean through its constructor, and pass the result to the workflow as the activity output. | `java-workflow-class.md` "Workflow determinism" (the workflow class takes no collaborators); `references/java/determinism.md` "Forbidden calls" |

## Confidence notes

- DWF-DET-001 — `ctx.getCurrentInstant()` is the safe API; never report it. A `java.time` value that only formats or compares instants already obtained from `ctx.getCurrentInstant()` or the input is fine.
- DWF-DET-005 — `Executor` and `CompletableFuture` may appear only as imports or as types in a helper that the workflow never calls; report only when the workflow body creates or awaits them. `ctx.allOf(...)` / `ctx.anyOf(...)` are the safe APIs.
- DWF-DET-008 — `\w+Repository\.` matches a call on a repository bean. A repository type used only as a record component or import is not a finding. A repository taken through the constructor and called in the body is reported as DWF-DET-008 (the I/O), not also as DWF-DET-017.
- DWF-DET-011 — `static final` constants (for example a `WorkflowTaskOptions` retry policy, an event-name `String`) and `final` fields assigned only in the constructor are not written in the body: never report them. Local variables declared inside the lambda are not fields.
- DWF-DET-012 — `ctx.getLogger()` satisfies the rule: do not report it, not even under "Please verify". A `Logger` call inside an `if (!ctx.isReplaying())` block also satisfies it.
- DWF-DET-013 — Report as critical only when the loop is clearly unbounded (`while (true)`, `for (;;)`, a condition that is never updated). For loops whose bound depends on runtime data, emit as "Please verify". Also flag (as part of this rule) any `ctx.*` call scheduled after `ctx.continueAsNew(...)` in the same execution path.
- DWF-DET-016 — `catch (TaskFailedException e)`, `catch (TaskCanceledException e)`, `catch (CompositeTaskFailedException e)` and `catch (InterruptedException e)` are not broad catches. A broad catch whose `try` contains no `.await()` (for example around pure parsing of the input) is not this rule, nor is one whose block rethrows the caught exception unchanged (`throw e;`) on every path, because `OrchestratorBlockedException` then still reaches the SDK. Cite the `catch` line.
- DWF-DET-016 (multi-catch and helpers) — A multi-catch is broad when any alternative is `Exception`, `Throwable` or `RuntimeException` (`catch (IOException | RuntimeException e)` is; `catch (IOException | TaskFailedException e)` is not). When the `try` block calls a helper instead of `.await()` directly, follow the call one level: a method of the workflow class whose body calls `.await()` counts as the `try` containing it. When the helper is outside the review scope (another class, or a method whose body cannot be read), report the catch under Please verify instead of Critical.
- DWF-DET-017 — Always "Please verify": the bean may be a pure, stateless helper (a calculator, a mapper), which is safe. Report each called bean once, at its first call in the body. A bean whose call is already reported as DWF-DET-006 (an HTTP client such as an injected `RestClient`), DWF-DET-007 (file I/O) or DWF-DET-008 (a repository) is reported under that rule only, not also as DWF-DET-017. Calls on `ctx`, on the input record, or on records and collections built in the body are not bean calls.

## Cross-reference

If a rule trips inside a method that is not the `WorkflowStub` lambda (or `run`), confirm the method is reachable from it before reporting. Pure helper methods that the workflow never calls are out of scope. Code in `WorkflowActivity` classes, `@RestController` classes and other `@Component` / `@Service` beans is out of scope for this skill: non-deterministic code is expected there.
