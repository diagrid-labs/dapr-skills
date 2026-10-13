# docker-compose.observability.yaml

> **WARNING: Development only.** The stack below uses hardcoded default credentials (`admin:admin`) and enables anonymous viewer access on Grafana. Do not expose any of these ports on a shared network, a docker-compose network reachable from other services, or a port-forwarded VM — a publicly-reachable Grafana with `admin:admin` is a real incident. For any environment beyond a single developer's laptop, change `GF_SECURITY_ADMIN_PASSWORD` to a secret, set `GF_AUTH_ANONYMOUS_ENABLED=false`, and put the stack behind an auth proxy or VPN.

Local observability stack for Python agent projects. Starts Zipkin (traces), Prometheus (metrics), and Grafana (dashboards). Native `dapr-agents` projects use it as shown; projects with `diagrid` framework wrappers swap Zipkin for Jaeger (see "Wrapper variant" below). Place this file in the project root so users can bring the stack up with `docker compose -f docker-compose.observability.yaml up -d`.

```yaml
services:
  zipkin:
    image: openzipkin/zipkin:latest
    container_name: agent-zipkin
    ports:
      - "9411:9411"

  prometheus:
    image: prom/prometheus:latest
    container_name: agent-prometheus
    ports:
      - "9099:9090"
    volumes:
      - ./observability/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"

  grafana:
    image: grafana/grafana:latest
    container_name: agent-grafana
    ports:
      - "3000:3000"
    environment:
      # DEV-ONLY defaults. In any shared environment:
      # - Set GF_SECURITY_ADMIN_PASSWORD from a secret, not a literal.
      # - Set GF_AUTH_ANONYMOUS_ENABLED=false.
      # - Put Grafana behind an auth proxy or VPN.
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer
    volumes:
      - ./observability/grafana-datasources.yaml:/etc/grafana/provisioning/datasources/datasources.yaml:ro
      - ./observability/dashboards:/etc/grafana/provisioning/dashboards:ro
    depends_on:
      - prometheus
```

Accompanying files placed in `./observability/`:

- `prometheus.yml` — scrape config (see `agent-metrics-prometheus.md`)
- `grafana-datasources.yaml` — auto-provisions the Prometheus datasource pointing at `http://prometheus:9090`
- `dashboards/dapr-agents.json` — default dashboard (workflow throughput, LLM call count, activity latency)
- `dashboards/provider.yaml` — Grafana dashboard provisioning manifest

### Usage

1. `docker compose -f docker-compose.observability.yaml up -d` — starts Zipkin + Prometheus + Grafana.
2. `dapr run -f .` in another terminal — starts the agent with tracing enabled.
3. Open Zipkin at http://localhost:9411 to see per-request traces.
4. Open Grafana at http://localhost:3000 (anonymous viewer) to see dashboards.
5. Open Prometheus at http://localhost:9099 (web UI) to query raw metrics.

### Wrapper variant (OTLP)

`diagrid` wrapper runners export their spans (and logs) over **OTLP gRPC only**, which Zipkin cannot receive. For a project with wrapper apps (including a native coordinator with wrapper specialists), replace the `zipkin` service with Jaeger, which accepts OTLP and serves its own UI:

```yaml
  jaeger:
    image: jaegertracing/jaeger:latest
    container_name: agent-jaeger
    ports:
      - "16686:16686"   # UI
      - "4317:4317"     # OTLP gRPC
      - "4318:4318"     # OTLP HTTP
```

- Point the sidecars at it with the OTLP `tracing.yaml` (`agent-tracing-otlp.md`, `endpointAddress: "localhost:4317"`), and the wrapper apps with `OTEL_EXPORTER_OTLP_ENDPOINT: http://localhost:4317` plus a per-app `OTEL_SERVICE_NAME` in their `dapr.yaml` `env:` block.
- A native coordinator in the same project sends its app spans to the same receiver with `AgentObservabilityConfig(..., tracing_exporter=AgentTracingExporter.OTLP_GRPC, endpoint="http://localhost:4317")` (the `http://` scheme makes the gRPC exporter connect without TLS).
- Open Jaeger at http://localhost:16686 instead of Zipkin in step 3 above. Prometheus and Grafana are unchanged.

### Port assignments

- Zipkin: host `9411` → container `9411` (wrapper variant: Jaeger UI `16686`, OTLP `4317` / `4318`)
- Prometheus: host `9099` → container `9090` (host port moved to `9099` so it does not conflict with Dapr sidecar metrics ports `9091`, `9092`, … and the Diagrid Dapr Dev Dashboard on `9090`)
- Grafana: host `3000` → container `3000`
- Dapr sidecar metrics ports (`9091`, `9092`, `9093`, …; `9090` is left free for the Diagrid Dapr Dev Dashboard) are reserved for the sidecars themselves and scraped via `host.docker.internal` from inside the Prometheus container.
