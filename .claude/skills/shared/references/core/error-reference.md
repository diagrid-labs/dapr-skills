# Error Reference

## Workflow Status Reference

The `OrchestrationStatus` enum (from `durabletask-go/api/orchestration.go`) defines all possible states a workflow instance can be in.

| Status | Constant | Description | Terminal? |
|--------|----------|-------------|-----------|
| `RUNNING` | `RUNTIME_STATUS_RUNNING` | Workflow is actively executing or waiting for input (external event, timer, activity result). | No |
| `PENDING` | `RUNTIME_STATUS_PENDING` | Workflow has been scheduled but has not started executing yet. | No |
| `COMPLETED` | `RUNTIME_STATUS_COMPLETED` | Workflow function returned successfully. Result is available via metadata API. | Yes |
| `FAILED` | `RUNTIME_STATUS_FAILED` | Workflow function returned an error or an activity exhausted all retries. Failure details available. | Yes |
| `TERMINATED` | `RUNTIME_STATUS_TERMINATED` | Workflow was explicitly stopped via the terminate API before completing. | Yes |
| `CANCELED` | `RUNTIME_STATUS_CANCELED` | Workflow was canceled (typically via cancellation token/context). | Yes |
| `SUSPENDED` | `RUNTIME_STATUS_SUSPENDED` | Workflow has been explicitly paused. It will not process new events until resumed. | No |
| `CONTINUED_AS_NEW` | `RUNTIME_STATUS_CONTINUED_AS_NEW` | Workflow completed one run and started a new run (used for eternal workflows). | Partial |
| `STALLED` | `RUNTIME_STATUS_STALLED` | Workflow is stuck and cannot make progress (e.g., the app processing it is gone). | No |

**Terminal states** (`COMPLETED`, `FAILED`, `TERMINATED`, `CANCELED`) allow the workflow state to be purged. Non-terminal states block new instances with the same ID from being created.

**State transitions:**
```
PENDING → RUNNING → COMPLETED
                 → FAILED
                 → TERMINATED
                 → CANCELED
                 → CONTINUED_AS_NEW → (new run starts as PENDING)
         RUNNING ↔ SUSPENDED
         RUNNING → STALLED
```

## Non-Determinism Errors

Dapr Workflow uses event sourcing and replay: when a workflow resumes, the runtime replays history events to reconstruct state. If the current code produces different actions than the recorded history, the replay diverges.

**What it looks like:**

The workflow enters an error state or produces unexpected behavior. In `durabletask-go`, the executor logs errors when task IDs from history do not match what the current code produces. The orchestrator code contains several `// TODO: This could be a duplicate event or it could be a non-deterministic orchestration` markers where detection is currently incomplete — Dapr does not raise a named error code the way Temporal does.

Symptoms to look for:
- Workflow stuck in `RUNNING` with no progress after a deployment
- Activities executing out of order or with wrong inputs
- `UnknownTaskIDError`: `unknown instance ID/task ID combo: <id>/<seq>` in sidecar logs

**Common causes:**

1. **Workflow code changed after instances started** — any change to the sequence, names, or number of activity calls breaks replay for in-flight instances.
2. **Non-deterministic APIs used in workflow code** — `time.Now()`, `rand.Float64()`, `uuid.New()`. These produce different values on each replay.
3. **I/O or network calls in workflow code** — HTTP calls, database reads, or file reads in the workflow function (not in activities) return different results on replay.
4. **Conditional branches depending on external state** — reading environment variables or global mutable state inside a workflow function.

**How to debug:**

1. Identify when the broken deployment went out relative to when the affected workflow instances started.
2. Fetch the workflow history via the management API: `GET /v1.0/workflows/<instanceId>/history`
3. Compare the history event sequence (activity names, order, sequence numbers) against what the current code would produce.
4. Use `ctx.IsReplaying()` (Go SDK: `wfctx.IsReplaying()`) to gate log output — logs emitted during replay indicate where replay is active.

**Recovery:**
- **Accidental change, workflow not yet past the divergence point:** Revert the code change and redeploy.
- **Intentional change:** Use the versioning/patching API (see `versioning.md`). For dev/test, terminate the old instance and start a new one.

## Activity Failure Types

| Failure Type | How It Surfaces | Default Behavior |
|---|---|---|
| **Application error** | Activity function returns an error / throws an exception | Workflow receives the error; retries if a `RetryPolicy` is configured |
| **Retry exhaustion** | Activity has a `RetryPolicy` with `MaxAttempts > 0` and all attempts failed | `TaskFailedEvent` recorded in history; error propagated to workflow |
| **Activity timeout** | `StartToCloseTimeout` exceeded for a single attempt | Counted as a failed attempt; subject to retry policy |
| **Task cancellation** | `api.ErrTaskCancelled` — the workflow was terminated or canceled while an activity was pending | Activity result is discarded; workflow moves to terminal state |

**RetryPolicy fields** (from `durabletask-go/workflow/activity.go`):
- `MaxAttempts int` — total number of attempts (1 = no retries)
- `InitialRetryInterval time.Duration`
- `BackoffCoefficient float64`
- `MaxRetryInterval time.Duration`
- `RetryTimeout time.Duration`

## Common Error Messages

| Error / Log Message | Likely Cause | Fix |
|---|---|---|
| `no such instance exists` (`api.ErrInstanceNotFound`) | Queried or operated on a workflow ID that does not exist or has been purged | Check instance ID; verify workflow was not purged |
| `orchestration instance already exists` (`api.ErrDuplicateInstance`) | Tried to start a workflow with an ID already used by a running instance | Use a unique instance ID, or set an `OrchestrationIdReusePolicy` |
| `orchestration has not yet completed` (`api.ErrNotCompleted`) | Called a blocking wait API before the workflow finished | Wait longer or poll with a timeout |
| `orchestration did not report failure details` (`api.ErrNoFailures`) | Tried to retrieve failure info from a non-failed workflow | Check that the workflow actually failed before reading failure details |
| `workflow is stalled` (`api.ErrStalled`) | Workflow actor lost its processing app; no replica is consuming its work items | Ensure at least one replica of the workflow app is running |
| `unknown instance ID/task ID combo` (`UnknownTaskIDError`) | History replay mismatch — non-determinism or a bug in the backend | Check for code changes that affected activity call order; see Non-Determinism section |
| `orchestrator version is not registered` (`UnsupportedVersionError`) | Workflow type name not registered in the current worker | Register the workflow function with the runtime before starting |
| `duplicate event` (`runtimestate.ErrDuplicateEvent`) | Backend received the same history event twice | Usually internal; indicates a backend consistency issue |

## See Also

- [Determinism Constraints](determinism.md) — what is and isn't allowed in workflow code
- [Troubleshooting](troubleshooting.md) — decision trees for diagnosing live issues
- [Versioning](versioning.md) — safe code evolution for in-flight workflows
