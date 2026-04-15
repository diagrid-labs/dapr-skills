# Activity Checklist — Python

Apply each rule below to every file in `activity_files` produced by `review-detect-target.md`. The "scope" of every rule is a function decorated with `@wfr.activity(...)`.

Rule source: see [`../create-workflow-python/REFERENCE.md`](../create-workflow-python/REFERENCE.md) — section "Activity definition".

| Rule id     | Severity | What to detect                                                                                                          | Why it matters                                                                                            | Suggested fix                                                                                  |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| DWF-ACT-001 | critical | `DaprWorkflowClient` referenced inside an activity function                                                              | Activities must not orchestrate other workflows directly; this can deadlock and corrupt history.          | Return data from the activity and let the parent workflow `yield ctx.call_child_workflow(...)`.|
| DWF-ACT-002 | critical | Activity makes external calls (`requests`, `httpx`, db clients) without an idempotency key / taskExecutionId  | Workflow runtime retries activities on failure; without idempotency the side effect runs N times.        | Use the taskExecutionId on the workflow activity context.     |
| DWF-ACT-003 | warning  | `try: ... except Exception: pass` (or `except: pass`) inside an activity                                                  | Swallowing exceptions hides retries and silently turns a failure into a success.                          | Re-raise, or return a typed Pydantic result that carries success/failure.                      |
| DWF-ACT-004 | warning  | Activity input/output type is `str` / `bytes` with no documented size cap                                                 | Large payloads are persisted in workflow history; oversized payloads break state-store limits.           | Pass a pointer (id, blob URL) and store the body separately.                                   |
| DWF-ACT-005 | warning  | Activity function performs `requests.get/post(...)` (sync) inside an `async def` activity                                  | Mixes sync I/O on the event loop and blocks other activity work.                                          | Use `httpx.AsyncClient` (or run sync calls via `asyncio.to_thread`).                           |
| DWF-ACT-006 | warning  | `time.sleep(N)` with `N >= 300` (5 min) inside an activity                                                                 | Long blocking activities risk timeouts and hide progress.                                                 | Split into smaller activities or move the wait to `ctx.create_timer` in the workflow.          |
| DWF-ACT-007 | warning  | Module-level mutable globals (`global ...`, top-level lists/dicts) read or written from activity scope                    | Activities run on shared workers; module globals leak across invocations and instances.                  | Inject dependencies (e.g., via a closure or class) instead of using globals.                   |
| DWF-ACT-008 | info     | Activity decorator name does not match the convention `<thing>_activity`                                                   | Naming convention violation that complicates cross-language calls.                                       | Rename to `<verb>_activity` and update workflow callers.                                       |
| DWF-ACT-009 | info     | Activity does not type its input/output with Pydantic models                                                                | Untyped payloads make versioning and validation fragile.                                                 | Use Pydantic types declared in `models.py`.                                                    |
| DWF-ACT-010 | warning  | `print(` used inside an activity instead of `logging`                                                                       | Bypasses the application's log pipeline and structured logging.                                          | Use `logging.getLogger(__name__).info(...)`.                                                   |
| DWF-ACT-011 | warning  | Activity function name shadows another exported symbol in the same module                                                   | The runtime registers activities by decorator name; a shadowed function silently changes which runs.      | Rename to disambiguate.                                                                        |

## Confidence notes

- DWF-ACT-002 — Idempotency keys may appear as a header (`Idempotency-Key`), as a derived id, or the built-in taskExecutionId; treat as satisfied if any value of these 3 options are used.
- DWF-ACT-005 — `requests` inside a sync `def` activity is fine; only flag inside `async def` activities.
- DWF-ACT-006 — Heuristic only; downgrade to "Please verify" when the wait is intentional (e.g., rate-limit backoff).

## Cross-reference

Rules that detect non-determinism inside activities are **not** in scope here — those are intentional in activities. This skill assumes the corresponding workflow file has been or will be reviewed by `review-workflow-determinism`.
