# Operational Troubleshooting — Dapr Workflows

## State Store Failures

### What happens

Workflow state is persisted synchronously during each checkpoint. When the state store becomes
unavailable:

- The sidecar cannot complete the state write and the workflow actor stalls.
- Pending operations (inbox messages, history appends) accumulate and are retried by the actor
  reminder mechanism. Actor reminders fire repeatedly until the state store recovers.
- If the state store is unavailable for long enough that the actor's `drainOngoingCallTimeout`
  expires during a rebalance, the workflow actor may be forcefully deactivated.
- Activities that have already been dispatched to application code will complete, but the results
  cannot be committed until the state store recovers.

### Recovery

Once state store connectivity restores, the actor reminder fires, the actor reactivates, replays
from the last persisted checkpoint, and execution resumes. No manual intervention is required for
transient outages.

### Diagnosis

```bash
# Check sidecar logs for state store errors
kubectl logs <pod> -c daprd | grep -E "state store|statestore|error"

# Verify state store component is healthy
kubectl describe component workflow-statestore
```

Watch for error patterns:
- `"failed to save actor state"` — state store write failure
- `"context deadline exceeded"` — state store timeout (tune `timeout` metadata on the component)

---

## Sidecar Restarts

### Expected behavior

When `daprd` restarts (pod crash, OOM kill, rolling deployment), all workflow actors hosted on
that sidecar are deactivated. No state is lost — all workflow state was persisted in the state
store at the last checkpoint.

On the next triggering event (timer expiry, external event, activity completion), the placement
service routes the message to a new host. The workflow actor activates on the new host, loads its
history from the state store, replays from the beginning, and arrives at the correct current state.

This is the intended behavior of the event sourcing model. Sidecar restarts are safe and self-healing.

### What to watch for

Frequent sidecar restarts indicate an underlying problem (OOM, liveness probe misconfiguration,
node pressure). Monitor:

```bash
kubectl get pods -w | grep daprd   # watch restart counts
kubectl top pods                    # check memory pressure
```

If workflows are consistently delayed after sidecar restarts, the replay cost may be high due to
long history. Consider using `continue_as_new` to truncate history in long-running workflows.
See [`core/patterns.md`](../core/patterns.md) for the eternal workflow pattern.

---

## Rolling Updates

### Actor rebalance during deployments

During a rolling deployment, pods are replaced one at a time. As each pod terminates:

1. Its sidecar deregisters from the placement service.
2. The placement ring is updated.
3. Workflow actors that were on the terminating pod are redistributed to remaining pods.
4. In-flight activities experience a brief pause until the actor reactivates elsewhere.

Workflows are **not lost** during rolling updates — they resume from checkpoint after reactivation.

### Reducing disruption

Use `maxSurge` in your Kubernetes deployment strategy to maintain capacity during the transition:

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # Allow one extra pod during rollout
      maxUnavailable: 0  # Never reduce below desired count
```

Set `drainOngoingCallTimeout` high enough to cover the duration of your longest expected activity:

```json
{
  "drainOngoingCallTimeout": "5m",
  "drainRebalancedActors": true
}
```

With `drainRebalancedActors: true`, the sidecar waits up to `drainOngoingCallTimeout` for in-progress
actor calls to complete before forcing deactivation during a rebalance.

---

## State Cleanup

### The problem

Workflow actor state persists in the state store indefinitely after a workflow completes. The history
log, inbox, metadata, and customStatus keys all remain. Without cleanup, storage grows unboundedly.

From the Dapr docs: _"Creating a large number of workflows could result in unbounded storage usage."_

### Solutions

**Manual purge via API** — purge a specific workflow instance:

```bash
# HTTP API
curl -X POST http://localhost:3500/v1.0/workflows/dapr/<workflow-name>/purge/<instance-id>

# Dapr CLI
dapr invoke --app-id myapp --method "purge/<instance-id>" --verb POST
```

Each language SDK also exposes a `PurgeWorkflow` method. Purge removes all history, inbox, metadata,
and customStatus keys for the given instance.

**Batch purge for automation** — schedule a cron job or recurring workflow to purge completed
instances older than a retention window:

```python
# Example: purge all completed workflows older than 30 days
completed = client.list_workflows(status=WorkflowStatus.COMPLETED)
for wf in completed:
    if wf.created_at < cutoff:
        client.purge_workflow(wf.instance_id)
```

**PostgreSQL retention policy** — if you are using PostgreSQL as your state store, you can
implement a scheduled SQL job to delete expired workflow state keys directly:

```sql
-- Remove workflow state keys older than 30 days
-- Keys follow the pattern: <appID>||<actorType>||<instanceID>||history-*
DELETE FROM state
WHERE created_at < NOW() - INTERVAL '30 days'
  AND key LIKE '%dapr.internal%workflow%history%';
```

Use the Dapr API purge path when possible — direct database deletes bypass Dapr's state management
and may miss associated keys.

---

## Performance Tuning

### State store optimizations

**Connection pooling** — default connection pool settings are conservative. For high-throughput
workflow deployments, tune the PostgreSQL component:

```yaml
- name: maxConns
  value: "20"
- name: connectionMaxIdleTime
  value: "5m"
```

**Separate stores for different throughput profiles** — if you have a mix of high-frequency
short workflows (e.g., order processing) and low-frequency long workflows (e.g., approval flows),
consider routing them to separate state store instances. This prevents high-throughput workflows
from saturating the connection pool for long-running ones.

**Read replicas** — for state stores that support read replicas (PostgreSQL, CosmosDB), queries
against workflow state (e.g., listing workflows by status) can be routed to replicas to avoid
contention with write-heavy workflow execution.

### Actor idle timeout tuning

`actorIdleTimeout` controls the memory/latency trade-off for workflow actors:

| Setting | Trade-off |
|---|---|
| Short timeout (e.g., 5m) | Lower memory usage; higher reactivation cost on each new message |
| Long timeout (e.g., 1h) | Higher memory usage; faster response to subsequent messages |

For workflows that receive frequent external events or timers, a longer idle timeout reduces
reactivation overhead. For workflows that are mostly idle (waiting for human approval, etc.), a
shorter timeout frees memory without meaningful latency cost.

### Diagnosing slow workflows

1. Check `runtime/workflow/scheduling/latency` — high values indicate placement service or actor
   activation delays, not application code.
2. Check `runtime/workflow/activity/execution/latency` by activity name — identify which specific
   activities are slow.
3. Check state store latency metrics — workflow checkpoints block on state store writes.
4. Check sidecar memory and CPU — sidecar resource exhaustion degrades all workflow operations.
