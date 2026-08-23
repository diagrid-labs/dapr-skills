# Dapr metrics for Prometheus

Every Dapr sidecar exposes Prometheus metrics on the port declared by `metricsPort` in `dapr.yaml`. For native `dapr-agents` scaffolds, this is set to `9090` (single agent) or `9090`, `9091`, `9092`, … (multi-agent).

### What's on the endpoint

Scrape `http://localhost:<metricsPort>/metrics` to see:

- `dapr_http_server_request_count` — HTTP requests handled by the sidecar (one series per app + method + status)
- `dapr_grpc_io_server_completed_rpcs` — gRPC calls between sidecars (pub/sub, service invocation)
- `dapr_runtime_actor_*` — actor activations, method invocations, reminder fires (workflow is built on actors)
- `dapr_workflow_*` — workflow start/complete/fail counts and latencies
- `dapr_component_conversation_count` — one increment per **conversation API invocation**, i.e. per LLM call the agent makes through its `llm-provider` component. Labelled `app_id`, `component`, `success` — so this is where you see an agent's LLM call rate and its LLM error rate, split per agent
- `dapr_component_conversation_latencies` — histogram of conversation-component response time; the LLM latency the agent actually experienced, same labels
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

These two conversation metrics are emitted by the sidecar for any app that calls the conversation API, so they cover both native `dapr-agents` agents and .NET Microsoft Agent Framework agents. A framework wrapper that calls its provider SDK directly bypasses the conversation building block and therefore does **not** produce them — for those projects, LLM call rate has to come from the framework's own instrumentation.

Useful starting queries:

```promql
# LLM calls per second, per agent
sum by (app_id) (rate(dapr_component_conversation_count[1m]))

# LLM error rate, per agent
sum by (app_id) (rate(dapr_component_conversation_count{success="false"}[5m]))

# p95 LLM latency, per agent
histogram_quantile(0.95, sum by (app_id, le) (rate(dapr_component_conversation_latencies_bucket[5m])))
```

### Grafana dashboard

The scaffold also ships a basic Grafana dashboard JSON that plots workflow throughput, workflow latency, and conversation-API call rate. Load it via Grafana's "Import" button pointing at `dashboards/dapr-agents.json`.
