# dapr.yaml — single agent

Multi-app run file in the project root that launches a single agent with its Dapr sidecar. Native `dapr-agents` scaffolds also include tracing and metrics defaults when observability is enabled.

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
  logLevel: info
  configFilePath: ./resources/tracing.yaml
apps:
  - appID: <app-id>
    appDirPath: <ProjectName>
    appPort: <app-port>
    daprHTTPPort: 3500
    daprGRPCPort: 50001
    metricsPort: 9090
    command: ["uv", "run", "main.py"]
```

- `resourcesPath` points to the `resources/` folder with component YAMLs.
- `configFilePath` points at the Dapr `Configuration` YAML with tracing + sampling settings. Remove this line (and delete `resources/tracing.yaml`) if observability is opt-out.
- `logLevel: info` is the production default; set to `debug` when diagnosing problems.
- `appLogDestination: fileAndConsole` writes sidecar + app logs to `.dapr/logs/` on disk. Those files contain request-level detail, including user task text — treat them as sensitive. Exclude `.dapr/` from git (the generated `.gitignore` already does this) and from any log aggregation pipeline that has retention requirements.
- `metricsPort` exposes Dapr's Prometheus metrics on the sidecar. Scrape from `http://localhost:9090/metrics`. The local Prometheus container in `docker-compose.observability.yaml` scrapes this via `host.docker.internal:9090`; see [`agent-metrics-prometheus.md`](./agent-metrics-prometheus.md) for the scrape config and [`agent-observability-stack.md`](./agent-observability-stack.md) for the container layout and port map.
- `daprHTTPPort` is the Dapr sidecar HTTP endpoint. Agent code does not need to know it when using the SDK.
- Start the application with `dapr run -f .` from the project root.

For the .NET variant, replace `command: ["uv", "run", "main.py"]` with `command: ["dotnet", "run", "--project", "<ProjectName>"]`.
