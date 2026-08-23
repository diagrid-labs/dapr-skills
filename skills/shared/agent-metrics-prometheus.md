# Dapr metrics for Prometheus

Every Dapr sidecar exposes Prometheus metrics on the port declared by `metricsPort` in `dapr.yaml`. For native `dapr-agents` scaffolds, this is set to `9090` (single agent) or `9090`, `9091`, `9092`, … (multi-agent).

### What's on the endpoint

Scrape `http://localhost:<metricsPort>/metrics` to see:

- `dapr_http_server_request_count` — HTTP requests handled by the sidecar (one series per app + method + status)
- `dapr_grpc_io_server_completed_rpcs` — gRPC calls between sidecars (pub/sub, service invocation)
- `dapr_runtime_actor_*` — actor activations, method invocations, reminder fires (workflow is built on actors)
- `dapr_workflow_*` — workflow start/complete/fail counts and latencies
- `dapr_component_*` — calls per component (state stores, pubsub, conversation)
- `dapr_resiliency_*` — retries, circuit-breaker trips
- Standard process + Go runtime metrics

### Prometheus scrape config

The scaffold's `docker-compose.observability.yaml` includes a `prometheus.yml` with a job that scrapes every Dapr sidecar port on the host (single-agent and up to N specialists). Example stanza:

```yaml
scrape_configs:
  - job_name: dapr-sidecars
    static_configs:
      - targets:
          - host.docker.internal:9090
          - host.docker.internal:9091
          - host.docker.internal:9092
    scrape_interval: 5s
```

### Grafana dashboard

The scaffold also ships a basic Grafana dashboard JSON that plots workflow throughput, workflow latency, and LLM request count. Load it via Grafana's "Import" button pointing at `dashboards/dapr-agents.json`.
