# docker-compose.observability.yaml

> **WARNING: Development only.** The stack below uses hardcoded default credentials (`admin:admin`) and enables anonymous viewer access on Grafana. Do not expose any of these ports on a shared network, a docker-compose network reachable from other services, or a port-forwarded VM — a publicly-reachable Grafana with `admin:admin` is a real incident. For any environment beyond a single developer's laptop, change `GF_SECURITY_ADMIN_PASSWORD` to a secret, set `GF_AUTH_ANONYMOUS_ENABLED=false`, and put the stack behind an auth proxy or VPN.

Local observability stack for native `dapr-agents` projects. Starts Zipkin (traces), Prometheus (metrics), and Grafana (dashboards). Place this file in the project root so users can bring the stack up with `docker compose -f docker-compose.observability.yaml up -d`.

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

### Port assignments

- Zipkin: host `9411` → container `9411`
- Prometheus: host `9099` → container `9090` (host port moved to `9099` so it does not conflict with Dapr sidecar metrics ports `9090`, `9091`, …)
- Grafana: host `3000` → container `3000`
- Dapr sidecar metrics ports (`9090`, `9091`, `9092`, …) are reserved for the sidecars themselves and scraped via `host.docker.internal` from inside the Prometheus container.
