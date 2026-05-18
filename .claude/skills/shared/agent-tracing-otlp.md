# resources/tracing.yaml — OTLP (alternative)

For teams that already run an OpenTelemetry Collector, use the OTLP exporter instead of Zipkin:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Configuration
metadata:
  name: agent-tracing
spec:
  tracing:
    samplingRate: "1"
    otel:
      endpointAddress: "localhost:4317"
      isSecure: false
      protocol: grpc
```

- `endpointAddress` points at an OTLP collector — `localhost:4317` for gRPC, `localhost:4318` for HTTP.
- `isSecure: false` **must not be used when `endpointAddress` points to a remote host**. Traces carrying request metadata (and potentially PII) would travel unencrypted over the wire. Remote collectors require `isSecure: true` and a TLS endpoint; some SaaS vendors expose plaintext ingest on `4317` for legacy compat — do not use those endpoints from a production agent.
- `protocol` is `grpc` by default; use `http` if your collector listens on port 4318.
- OTLP traces can be forwarded from the collector to Jaeger, Tempo, Honeycomb, Datadog, or any OTLP-compatible backend without changing the agent. Apply the same PII review as documented in `agent-tracing-zipkin.md` before enabling cross-boundary export.
- Only use **one** of `zipkin` or `otel` in the Configuration — not both.
