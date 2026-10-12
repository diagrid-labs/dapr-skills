# resources/tracing.yaml — Zipkin

Dapr emits OpenTelemetry traces for every app → sidecar call, workflow activity, and state/pubsub interaction. For native `dapr-agents` projects, enable tracing by referencing a `Configuration` resource from `dapr.yaml` and pointing it at a Zipkin endpoint.

```yaml
apiVersion: dapr.io/v1alpha1
kind: Configuration
metadata:
  name: agent-tracing
spec:
  tracing:
    samplingRate: "1"
    zipkin:
      endpointAddress: http://localhost:9411/api/v2/spans
```

- `samplingRate: "1"` samples 100% of traces — appropriate for local dev and the scaffolded quickstart. Lower to `"0.1"` (10%) or `"0.05"` in production.
- `endpointAddress` points at a Zipkin collector. The `docker-compose.observability.yaml` included with the scaffold runs Zipkin on `localhost:9411`.
- The configuration is wired into `dapr.yaml` via `configFilePath: ./resources/tracing.yaml`.
- Every agent tool and workflow activity will appear as a span in Zipkin, threaded under the root workflow span so you can see end-to-end timings.

### PII and retention caveat

Spans capture request metadata and, with some exporters, fragments of the user's task text. When exporting traces to any SaaS observability vendor (Honeycomb, Datadog, Grafana Cloud, etc.), review whether the payload can carry PII (names, emails, healthcare identifiers, customer IDs) and either redact the span body server-side before export or disable body capture. The `samplingRate` controls volume, not content — a single sampled span is still a leak if it contains PII.
