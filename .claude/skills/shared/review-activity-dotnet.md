# Activity Checklist — .NET

Apply each rule below to every file in `activity_files` produced by `review-detect-target.md`. The "scope" of every rule is a class deriving from `WorkflowActivity<TInput, TOutput>` and its `RunAsync` method.

Rule source: see [`dotnet-activity-class.md`](dotnet-activity-class.md).

| Rule id     | Severity | What to detect                                                                                                          | Why it matters                                                                                            | Suggested fix                                                                                  |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| DWF-ACT-001 | critical | `DaprWorkflowClient` referenced inside an activity (constructor parameter or method body)                                | Activities must not orchestrate other workflows directly; this can deadlock and corrupt history.          | Return data from the activity and let the parent workflow call `CallChildWorkflowAsync`.       |
| DWF-ACT-002 | critical | Activity makes external calls (`HttpClient`, DB clients) without an idempotency key / TaskExecutionId | Workflow runtime retries activities on failure; without idempotency the side effect runs N times.        | Use the built-in `context.TaskExecutionId`.         |
| DWF-ACT-003 | warning  | `try { ... } catch (Exception) { /* swallow */ }` with no rethrow and no typed result                                   | Swallowing exceptions hides retries and silently turns a failure into a success.                          | Either rethrow, or return a typed `Result`/`Output` record that carries success/failure.       |
| DWF-ACT-004 | warning  | Activity input or output type is `string` / `byte[]` / `Stream` with no documented size cap                              | Large payloads are persisted in workflow history; oversized payloads break state-store limits.           | Pass a pointer (id, blob URL) and store the body separately.                                   |
| DWF-ACT-005 | warning  | Activity declares `CancellationToken` but does not pass it to async calls                                                | Termination requests cannot interrupt long-running work.                                                  | Thread `context.CancellationToken` (or accept a `CancellationToken` parameter) into all I/O.   |
| DWF-ACT-006 | warning  | Activity body contains `await Task.Delay(TimeSpan.FromMinutes(N >= 5))` or longer                                        | Long activities risk timeouts and hide progress; runtime cannot heartbeat from inside.                    | Split into smaller activities or move the wait to a `context.CreateTimer` in the workflow.     |
| DWF-ACT-007 | warning  | `static` mutable fields in an activity class                                                                              | Activities run on shared workers; static state leaks across invocations and instances.                   | Hold dependencies via constructor injection; use scoped/transient lifetimes.                   |
| DWF-ACT-008 | info     | Activity class is not `internal sealed`                                                                                   | Convention violation — the create-workflow skill mandates `internal sealed`.                              | Mark as `internal sealed` (or `internal sealed partial` if it uses `LoggerMessage`).           |
| DWF-ACT-009 | info     | Activity does not declare both an input and output record type (uses primitives or anonymous types)                       | Primitive payloads make versioning and cross-language calls fragile.                                     | Define explicit `record` types in the `Models` folder.                                         |
| DWF-ACT-010 | warning  | `Console.WriteLine` / direct `Trace.WriteLine` instead of injected `ILogger<T>`                                           | Bypasses structured logging and the application's log pipeline.                                          | Inject `ILogger<TActivity>` and use `LoggerMessage` source generator.                          |
| DWF-ACT-011 | critical | Activity class is registered as a singleton via `services.AddSingleton<TActivity>` while holding mutable per-call state    | Concurrent activity executions will share that state.                                                    | Register activities via `RegisterActivity<T>()` only; do not also register as singleton.       |
| DWF-ACT-012 | warning  | Activity uses `async void` for any helper                                                                                  | `async void` cannot be awaited and cannot propagate exceptions; the runtime cannot mark it failed.        | Return `Task` / `Task<T>`.                                                                     |

## Confidence notes

- DWF-ACT-002 — Idempotency keys may appear as a header (`Idempotency-Key`), as a derived id, or the built-in `context.TaskExecutionId`; treat as satisfied if any value of these 3 options are used.
- DWF-ACT-003 — A `catch` that logs and rethrows is fine; only flag plain swallows.
- DWF-ACT-006 — Heuristic only — accept any `TimeSpan` literal or constant. Long polling activities may be intentional; downgrade to "Please verify" when in doubt.

## Cross-reference

Rules that detect non-determinism inside activities are **not** in scope here — those are intentional in activities. This skill assumes the corresponding workflow file has been or will be reviewed by `review-workflow-determinism`.
