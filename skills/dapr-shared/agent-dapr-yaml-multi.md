# dapr.yaml — multi-agent (coordinator + specialists)

Multi-app run file for a project with a coordinator agent and one or more specialists. Each app gets its own port and Dapr sidecar.

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
  logLevel: info
  configFilePath: ./resources/tracing.yaml
apps:
  - appID: coordinator
    appDirPath: coordinator
    appPort: 8000
    daprHTTPPort: 3500
    daprGRPCPort: 50001
    metricsPort: 9090
    command: ["uv", "run", "main.py"]
  - appID: <specialist-1>
    appDirPath: <specialist-1>
    appPort: 8001
    daprHTTPPort: 3501
    daprGRPCPort: 50002
    metricsPort: 9091
    command: ["uv", "run", "main.py"]
  - appID: <specialist-2>
    appDirPath: <specialist-2>
    appPort: 8002
    daprHTTPPort: 3502
    daprGRPCPort: 50003
    metricsPort: 9092
    command: ["uv", "run", "main.py"]
```

- Each app has a unique `appPort`, `daprHTTPPort`, `daprGRPCPort`, and `metricsPort`. Reusing ports is the single most common bring-up error.
- All apps share the same `resourcesPath`, so every agent sees the same components. Python: `agent-pubsub`, `agent-registry`, `agent-memory`, `agent-workflow`, `llm-provider`.
- Specialists subscribe to `<domain>.requests` and publish to `<domain>.results`. The coordinator publishes to each specialist's request topic and aggregates results.
- Start all apps together with `dapr run -f .` from the project root.
- `appLogDestination: fileAndConsole` writes per-app sidecar logs to `.dapr/logs/`. With multi-agent, that's one log directory per app, each containing request-level detail (user tasks, tool arguments). Exclude `.dapr/` from log aggregation pipelines with retention requirements; the generated `.gitignore` already excludes it from git.

## .NET variant

The default .NET multi-agent topology is **in-process**: one app registers every agent with `WithAgent(...)` and a Dapr Workflow orchestrates them with `context.RunAgentAsync(...)` (see `create-agent-dotnet/REFERENCE.md`). It needs only one app entry — use the single-agent file [`agent-dapr-yaml-single.md`](./agent-dapr-yaml-single.md) with the .NET changes listed there.

Only when the specialists must run as separate apps (independent deployment or scaling), use one entry per project:

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
  logLevel: info
apps:
  - appID: coordinator
    appDirPath: <CoordinatorProject>
    appPort: 5100
    daprHTTPPort: 3500
    daprGRPCPort: 50001
    metricsPort: 9090
    command: ["dotnet", "run"]
  - appID: <specialist-1>
    appDirPath: <Specialist1Project>
    appPort: 5101
    daprHTTPPort: 3501
    daprGRPCPort: 50002
    metricsPort: 9091
    command: ["dotnet", "run"]
```

- `command` is `["dotnet", "run"]` — it runs inside `appDirPath`, so do not add `--project`.
- `appPort` must match the `applicationUrl` in each project's `Properties/launchSettings.json` (`5100`, `5101`, …).
- There is no `configFilePath`; the .NET scaffold does not create `resources/tracing.yaml`. Add it together with the file if you enable tracing.
- .NET components: `agent-workflow` and `llm-provider`. There is no local `agent-registry` (it is a Catalyst opt-in via `.WithCatalyst()`), and conversation turns live in the session workflow rather than an `agent-memory` component. The coordinator calls specialists synchronously via Dapr service invocation, so no `agent-pubsub` component is needed.
