# Monitoring Dapr Workflows

## Overview

Dapr provides three observability layers for workflows: metrics (Prometheus), distributed tracing
(OTEL/Zipkin/Jaeger), and structured logs from the sidecar. Each layer serves a different purpose
and requires separate configuration.

Source: [workflow-architecture.md — Workflow distributed tracing](https://docs.dapr.io/developing-applications/building-blocks/workflow/workflow-architecture/#workflow-distributed-tracing),
[diagnostics/workflow_monitoring.go](https://github.com/dapr/dapr/blob/master/pkg/diagnostics/workflow_monitoring.go)

---

## Metrics

The Dapr sidecar (`daprd`) exposes workflow-specific metrics in Prometheus format. All metrics are
under the `runtime/workflow/` namespace and are tagged with `app_id`, `namespace`, and either
`workflow_name` or `activity_name`.

### Available Metrics

| Metric name | Type | Tags | Description |
|---|---|---|---|
| `runtime/workflow/operation/count` | Counter | `app_id`, `namespace`, `operation`, `status` | Count of workflow API requests (create, get, add event, purge) by operation and status (success/failed) |
| `runtime/workflow/operation/latency` | Histogram (ms) | `app_id`, `namespace`, `operation`, `status` | Latency of workflow API operations |
| `runtime/workflow/execution/count` | Counter | `app_id`, `namespace`, `workflow_name`, `status` | Count of workflow executions by name and status (success/failed/recoverable) |
| `runtime/workflow/execution/latency` | Histogram (ms) | `app_id`, `namespace`, `workflow_name`, `status` | End-to-end workflow execution duration |
| `runtime/workflow/scheduling/latency` | Histogram (ms) | `app_id`, `namespace`, `workflow_name` | Time between workflow execution request and actual execution start |
| `runtime/workflow/activity/operation/count` | Counter | `app_id`, `namespace`, `activity_name`, `status` | Count of activity scheduling requests |
| `runtime/workflow/activity/operation/latency` | Histogram (ms) | `app_id`, `namespace`, `activity_name`, `status` | Latency of activity scheduling requests |
| `runtime/workflow/activity/execution/count` | Counter | `app_id`, `namespace`, `activity_name`, `status` | Count of activity executions by name and status |
| `runtime/workflow/activity/execution/latency` | Histogram (ms) | `app_id`, `namespace`, `activity_name`, `status` | End-to-end activity execution duration |

### Scraping

Enable the Dapr metrics endpoint in your Dapr configuration or via Helm values. The metrics endpoint
is exposed by default on port `9090` of the sidecar:

```yaml
# Dapr Configuration
apiVersion: dapr.io/v1alpha1
kind: Configuration
metadata:
  name: dapr-config
spec:
  metric:
    enabled: true
```

Add a Prometheus scrape annotation to your pods:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "9090"
  prometheus.io/path: "/"
```

---

## Distributed Tracing

Workflow traces are generated automatically by the `durabletask-go` engine embedded in the sidecar.
They are captured and exported to your configured OTEL provider (Zipkin, Jaeger, OTEL Collector, etc.)

### Span Structure

Each workflow instance produces a span tree:

```
[workflow: my-order-workflow / instance: abc123]   <- parent span (full workflow duration)
  [activity: reserve-inventory]                    <- child span per activity
  [timer: wait-for-approval]                       <- child span per durable timer
  [child-workflow: payment-workflow]               <- child span per sub-workflow
```

The parent span covers the full end-to-end workflow execution, including idle time between steps.

### Known Gap: Activity Trace Context

> Workflow activity code currently **does not** have access to the trace context.

Spans for activities are created by the workflow engine inside the sidecar. The activity function
itself executes in application code without a propagated trace context. This means:

- You cannot add custom spans inside activity code that attach to the workflow trace.
- Any outbound calls your activity makes (HTTP, gRPC, Dapr service invocation) will start new
  root spans, not children of the workflow span.

This is a documented limitation of the current architecture. Track
[dapr/dapr#6950](https://github.com/dapr/dapr/issues/6950) for updates.

### Tracing Configuration

```yaml
apiVersion: dapr.io/v1alpha1
kind: Configuration
metadata:
  name: dapr-config
spec:
  tracing:
    samplingRate: "1"   # 1 = 100%, 0 = disabled
    zipkin:
      endpointAddress: "http://zipkin:9411/api/v2/spans"
```

---

## Logging

### Replay-Safe Logging

Workflow orchestrator code executes on every replay. Any logging inside the orchestrator function
body will produce duplicate log entries — once for the first execution, and again on each replay.

Where the SDK provides an `IsReplaying` flag (current support varies by SDK), guard your log
statements:

```python
# Python SDK example
def my_workflow(ctx: DaprWorkflowContext, input):
    if not ctx.is_replaying:
        logger.info("Starting order workflow for %s", input.order_id)
    result = yield ctx.call_activity(reserve_inventory, input=input)
```

```go
// Go SDK example
func MyWorkflow(ctx workflow.Context, input *MyInput) (*MyOutput, error) {
    if !ctx.IsReplaying() {
        workflow.GetLogger(ctx).Info("Processing order", "orderId", input.OrderID)
    }
    // ...
}
```

If your SDK does not expose `IsReplaying`, move all logging into activity functions instead —
activity code executes exactly once per invocation, never during replay.

### Sidecar Logs

The `daprd` sidecar emits structured JSON logs. For workflow debugging:

```bash
# Kubernetes
kubectl logs <pod-name> -c daprd --since=1h | grep -E "wfengine|workflow|activity"

# Self-hosted
dapr logs --app-id myapp
```

Relevant log namespaces:
- `dapr.wfengine.backend.actors` — actor backend, state store I/O, placement interactions
- `dapr.runtime` — sidecar startup, component loading

Increase log verbosity with `--log-level debug` on the sidecar for detailed workflow event
processing traces.

---

## Dashboards

Recommended Grafana panels for a workflow operations dashboard:

| Panel | Query hint | Purpose |
|---|---|---|
| Active workflows by status | `sum by (status) (runtime_workflow_execution_count)` | At-a-glance health |
| Activity success/failure rate | `rate(runtime_workflow_activity_execution_count[5m])` by `status` | Detect failing activities |
| Workflow completion time P50/P95/P99 | histogram quantile on `runtime_workflow_execution_latency` | SLO tracking |
| Activity execution time P50/P95/P99 | histogram quantile on `runtime_workflow_activity_execution_latency` by `activity_name` | Identify slow activities |
| Workflow scheduling latency | histogram quantile on `runtime_workflow_scheduling_latency` | Detect placement or queue delays |
| State store write latency | Dapr state store metrics (if enabled) | Correlate workflow slowdowns with storage |

A reference Grafana dashboard for Dapr metrics is available in the
[Dapr documentation — Grafana setup](https://docs.dapr.io/operations/observability/metrics/grafana/).
