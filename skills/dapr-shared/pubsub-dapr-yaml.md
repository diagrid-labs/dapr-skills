# dapr.yaml for pub/sub apps

## Two apps (publisher and subscriber)

.NET values:

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
apps:
  - appID: <root-kebab>-publisher
    appDirPath: <ProjectRoot>.Publisher
    appPort: 5110
    daprHTTPPort: 3510
    daprGRPCPort: 50010
    command: ["dotnet", "run"]
  - appID: <root-kebab>-subscriber
    appDirPath: <ProjectRoot>.Subscriber
    appPort: 5120          # omit this line for a streaming-only subscriber
    daprHTTPPort: 3520
    daprGRPCPort: 50020
    command: ["dotnet", "run"]
```

Python values: the same file with `appDirPath: publisher` / `subscriber`, `appPort: 8001` / `8002`, `daprHTTPPort: 3501` / `3502`, and `command: ["uv", "run", "main.py"]`. The Python entries have no `daprGRPCPort`.

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
apps:
  - appID: <root-kebab>-publisher
    appDirPath: publisher
    appPort: 8001
    daprHTTPPort: 3501
    command: ["uv", "run", "main.py"]
  - appID: <root-kebab>-subscriber
    appDirPath: subscriber
    appPort: 8002          # omit this line for a streaming-only subscriber
    daprHTTPPort: 3502
    command: ["uv", "run", "main.py"]
```

## Single app

One entry under `apps:` with the values of the role (publisher or subscriber) from the block above. The `appID` is `<root-kebab>-publisher` or `<root-kebab>-subscriber`, and the declarative `scopes` in `subscription.yaml` must use the same string.

## Appending to an existing dapr.yaml

- Add one entry under `apps:` with `Edit`.
- Pick ports that no other entry uses: increment each by 10 until free.
- Keep the existing `common.resourcesPath` and put new YAML files in that folder.
- Never replace the file.

## Port and appPort rules

- Declarative subscriber: `appPort` required.
- Programmatic subscriber: `appPort` required.
- Streaming subscriber in a create skill: omit `appPort`.
- Streaming subscriber added to an existing web app: keep the existing `appPort`, because the app still serves HTTP.
- A publisher that exposes an HTTP API (the create skills' `POST /orders`) also keeps its `appPort`.
- The `launchSettings.json` `http` profile port (.NET) must equal `appPort`.
