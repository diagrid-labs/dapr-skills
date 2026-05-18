# Troubleshooting

## Quick Status → Action Reference

| Status | First Check | Common Fix |
|--------|-------------|------------|
| `RUNNING` (no progress) | Is the sidecar running? Is the app connected? | Restart sidecar or app; check registration |
| `FAILED` | Read the failure message from metadata | Fix the bug; start a new instance |
| `STALLED` | Is any replica of the workflow app running? | Deploy or restart a workflow app replica |
| `SUSPENDED` | Was this paused intentionally? | Resume via management API if unintentional |
| `PENDING` (stuck) | Was the workflow app ever started? | Register and start the workflow app |

---

## 1. Workflow Stuck / Not Progressing

```
Workflow in RUNNING but nothing is happening?
│
├─▶ Is the Dapr sidecar running?
│   │
│   ├─▶ NO: Start it — `dapr run` or check your Kubernetes pod
│   │
│   └─▶ YES: Is the workflow app connected to the sidecar?
│       │
│       ├─▶ NO: Check app logs for gRPC connection errors
│       │       The app must connect via gRPC to get work items.
│       │       SDK connection is initiated by calling runtime.Start().
│       │
│       └─▶ YES: Is the state store configured as an actor state store?
│           │
│           ├─▶ NO: Workflow actors cannot persist state.
│           │       Add `actorStateStore: "true"` to your component spec.
│           │
│           └─▶ YES: Are the workflow and activities registered?
│               │
│               ├─▶ NO: The runtime never receives work items for unregistered types.
│               │       Register all workflow functions before calling runtime.Start().
│               │
│               └─▶ YES: Check workflow history for pending/failed tasks
│                   │
│                   ├─▶ Activity pending? → Activity may be timing out; check activity logs
│                   ├─▶ TaskFailed events? → Go to "Activity Keeps Retrying"
│                   └─▶ Waiting for external event? → Signal never arrived; go to "External Event Never Received"
```

**Key diagnostic commands:**

```bash
# Check sidecar is running and healthy
dapr list

# Fetch workflow metadata (status, last updated time)
curl "http://localhost:3500/v1.0/workflows/dapr/<instanceId>"

# Check sidecar logs for workflow errors
dapr logs --app-id <app-id>
```

---

## 2. Non-Determinism Error

```
Workflow stuck or producing wrong results after a deployment?
│
├─▶ Did you deploy new workflow code after this instance started?
│   │
│   ├─▶ YES: Did the change alter activity call order, names, or count?
│   │   │
│   │   ├─▶ YES: This is a non-determinism break.
│   │   │   ├─▶ Dev/test: Terminate old instance, start fresh with new code.
│   │   │   └─▶ Production: Use versioning/patching to gate new code paths.
│   │   │       See: versioning.md
│   │   │
│   │   └─▶ NO: Check for other non-deterministic patterns below
│   │
│   └─▶ NO: Check if workflow code uses any of these (all are forbidden):
│       ├─▶ time.Now() / DateTime.UtcNow / Instant.now() → use ctx.CurrentUtcDateTime
│       ├─▶ rand, random, uuid generation → use activity or ctx.NewGuid()
│       ├─▶ I/O (HTTP, DB, file reads) directly in workflow function → move to activity
│       └─▶ Global mutable state or env var reads → extract to activity or pass as input
```

**How to compare code against history:**

1. Fetch history: `GET /v1.0/workflows/dapr/<instanceId>/history`
2. List the activity names and sequence numbers from history events.
3. Trace through the current workflow code with the same input and verify the sequence matches.
4. Use `ctx.IsReplaying()` (Go: `wfctx.IsReplaying()`) to add conditional logging that fires only during replay for easier diagnosis.

---

## 3. Activity Keeps Retrying

```
Activity retrying repeatedly / workflow stuck in RUNNING with repeated TaskFailed events?
│
├─▶ Read the actual error from activity logs (not just "task failed")
│   │
│   ├─▶ Transient error (network timeout, service unavailable)
│   │   └─▶ Expected. Wait for the dependency to recover.
│   │       Adjust retry policy backoff if retrying too aggressively.
│   │
│   ├─▶ Permanent error (bug, invalid input, missing config)
│   │   └─▶ Fix the root cause and redeploy.
│   │       If input is invalid, fix the caller or validate before scheduling.
│   │
│   └─▶ Resource exhausted / rate limited
│       └─▶ Increase backoff interval in RetryPolicy.
│           Add jitter. Check rate limits of the downstream service.
```

**Check retry policy configuration:**

```go
// Go SDK: inspect your CallActivity options
task.WithActivityRetryPolicy(&task.RetryPolicy{
    MaxAttempts:          5,
    InitialRetryInterval: 5 * time.Second,
    BackoffCoefficient:   2.0,
    MaxRetryInterval:     1 * time.Minute,
})
```

If `MaxAttempts` is exhausted, the activity fails permanently and the error is returned to the workflow function. The workflow can then handle it or propagate it as a failure.

---

## 4. Workflow Not Starting

```
Scheduled workflow never moves from PENDING to RUNNING?
│
├─▶ Is the Dapr sidecar running and reachable?
│   └─▶ NO: Start the sidecar. `dapr run` or check pod health.
│
├─▶ Did the workflow app successfully connect to the sidecar?
│   │
│   ├─▶ Check app startup logs for gRPC stream errors
│   └─▶ The SDK must call runtime.Start() (or equivalent) to open the work item stream
│
├─▶ Is the workflow type registered in the running app?
│   │
│   └─▶ Check: the workflow function must be registered before Start() is called.
│       Unregistered types cause `UnsupportedVersionError` in the sidecar.
│
├─▶ Is the state store configured correctly?
│   │
│   └─▶ The actor state store component must have `actorStateStore: "true"`.
│       Verify with: `dapr components --app-id <app-id>`
│
└─▶ Is the placement service running (Kubernetes)?
    └─▶ Workflow actors depend on the actor placement service.
        Check: `kubectl get pods -n dapr-system`
```

---

## 5. State Store Growing Indefinitely

**Symptom:** State store size grows continuously; completed workflows accumulate data.

**Cause:** Completed (terminal) workflows are not automatically purged. Their history and metadata remain in the state store until explicitly removed.

**Fix:**

Purge completed workflows using the management API:

```bash
# Purge a specific instance (must be in COMPLETED, FAILED, or TERMINATED state)
curl -X DELETE "http://localhost:3500/v1.0/workflows/dapr/<instanceId>/purge"

# Bulk purge by status and time range (HTTP API)
curl -X DELETE "http://localhost:3500/v1.0/workflows/dapr/purge" \
  -H "Content-Type: application/json" \
  -d '{"createdTime": "2024-01-01T00:00:00Z", "statuses": ["COMPLETED", "FAILED"]}'
```

**Preventive strategies:**

- Set up a periodic job (cron or scheduled workflow) to bulk-purge terminal instances older than a retention window.
- Use `WithForcePurge(true)` only when you need to forcibly remove an instance regardless of state — this is unsafe for running instances.
- Monitor state store size and alert when it exceeds a threshold.

---

## 6. External Event Never Received

```
Workflow is waiting for an external event but never wakes up?
│
├─▶ Was the event raised to the correct instance ID?
│   └─▶ Check the raise-event API call: instance ID must match exactly.
│
├─▶ Was the event name spelled correctly?
│   └─▶ Event names are case-sensitive. Verify sender and receiver use the same name.
│
├─▶ Was the event raised before the workflow reached the WaitForExternalEvent call?
│   └─▶ If yes: the event is buffered in history and will be consumed when the
│       workflow reaches the wait. This is normal behavior — no action needed.
│
└─▶ Is the workflow in SUSPENDED state?
    └─▶ Resume it first: POST /v1.0/workflows/dapr/<instanceId>/resume
```

## See Also

- [Error Reference](error-reference.md) — status enum and error type definitions
- [Determinism Constraints](determinism.md) — what is forbidden in workflow code
- [Versioning](versioning.md) — safe code changes for in-flight workflows
