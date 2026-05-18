# Scaling Dapr Workflow Applications

## Overview

Dapr Workflow execution is distributed across your application cluster using the same actor placement
mechanism used by Dapr Actors. You do not manage workflow distribution manually — the Dapr placement
service handles routing automatically as you add or remove replicas.

Source: [workflow-architecture.md — Workflow actors](https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-architecture/#workflow-actors)

---

## Placement Service

The Dapr placement service maintains a consistent hash ring of available hosts for each actor type.
When a workflow application starts and registers its workflow and activity types, two internal actor
types are registered:

- `dapr.internal.{namespace}.{appID}.workflow`
- `dapr.internal.{namespace}.{appID}.activity`

The placement service assigns actor instances to hosts using consistent hashing. When a workflow
instance or activity is scheduled, the sidecar uses the placement lookup table to determine which
host owns that actor, then routes the message there.

Key behaviors:
- There is no locality relationship between where a workflow is started and where work items execute.
- All workflow and activity work is randomly distributed across all replicas.
- The placement service is updated on each host join/leave event, triggering a rebalance cycle.

---

## Horizontal Scaling

Adding replicas to your workflow application automatically expands the actor placement ring. During
the next rebalance cycle, workflow and activity actors are redistributed across the updated host set.

**No manual intervention is required.** The placement service handles all routing updates.

Scale-out flow:
1. New pod starts and its sidecar registers with the placement service.
2. Placement service updates the consistent hash ring.
3. New workflow and activity actors are routed to the new host.
4. Existing in-progress actors continue on their current host until they deactivate.

Scale-in flow:
1. Pod is terminated; its sidecar deregisters from placement.
2. Actors hosted on the removed pod are reactivated on remaining hosts as new messages arrive.
3. Workflow execution resumes from the last persisted checkpoint — no data is lost.

---

## gRPC Streaming

Workflow applications connect to their sidecar using a **gRPC server-streaming** channel. The
application pulls work items from the sidecar over this stream (start workflow, invoke activity, etc.)
and pushes results back.

Operational implications:

- **Load balancers must support HTTP/2 (gRPC).** Standard L4 TCP load balancers work. L7 HTTP/1.1
  load balancers will not work for the workflow gRPC stream.
- **Sticky sessions are NOT needed.** The placement service routes messages at the Dapr layer, not
  the load balancer layer.
- **The application does not need to open any inbound ports.** All interactions are initiated by the
  application pulling from the sidecar.

If you are running on Kubernetes, the default `ClusterIP` service type with gRPC-aware ingress
(e.g., Istio, NGINX configured for HTTP/2) works correctly.

---

## Resource Sizing

### Application Pods

| Resource | Driver | Guidance |
|---|---|---|
| Memory | Active workflow actors held in memory | Scale based on concurrent workflow count × average state size |
| CPU | Activity execution throughput | Proportional to activity tasks per second |
| Replicas | Throughput + availability | Minimum 2 for HA; add replicas as workflow backlog grows |

### Dapr Sidecar

The sidecar (`daprd`) handles actor placement lookups, state store I/O, and the gRPC stream
management. Increase sidecar CPU and memory limits when:

- You observe high state store latency under load
- Concurrent workflow count exceeds ~1000 active instances per sidecar

Default sidecar resource requests are conservative. For production workflow workloads, start with:

```yaml
resources:
  requests:
    cpu: "200m"
    memory: "256Mi"
  limits:
    cpu: "1000m"
    memory: "512Mi"
```

Adjust based on observed usage.

---

## Actor Configuration for Workflow

Workflow actors respect the standard Dapr actor configuration settings. These are set in the Dapr
`Configuration` resource (not the component spec):

```yaml
apiVersion: dapr.io/v1alpha1
kind: Configuration
metadata:
  name: dapr-config
spec:
  features:
    - name: ActorStateTTL
      enabled: true
  # Actor runtime configuration is set by the application SDK,
  # not in the Dapr Configuration resource. See actors-runtime-config docs.
```

The key actor runtime settings relevant to workflow scaling (configured in your application code
via the SDK, or via the app's actor configuration endpoint):

| Setting | Default | Effect on Workflows |
|---|---|---|
| `actorIdleTimeout` | 60 minutes | How long a workflow actor stays in memory after going idle. Shorter = lower memory, higher reactivation cost. |
| `actorScanInterval` | 30 seconds | How often Dapr scans for idle actors to deactivate. |
| `drainOngoingCallTimeout` | 60 seconds | How long Dapr waits for an in-progress actor call to complete during rebalance. Set this high enough to cover your longest activity execution. |

For workflows with long-running activities (minutes), increase `drainOngoingCallTimeout` to prevent
forced actor eviction mid-execution during scale events:

```json
{
  "actorIdleTimeout": "1h",
  "actorScanInterval": "30s",
  "drainOngoingCallTimeout": "5m",
  "drainRebalancedActors": true
}
```

Workflow actors use actor reentrancy internally to process multiple events within a single actor
activation without deadlocking. This is handled automatically by the Dapr runtime.
