# Create Dapr Pub/Sub .NET Application — Reference

Detailed reference for the `create-pubsub-dotnet` skill. All code and YAML live in `../dapr-shared/`; this file says which section to copy and where it goes.

## Folder structures

### Dapr CLI, role both

```text
<ProjectRoot>/
├── .gitignore
├── <ProjectRoot>.slnx
├── dapr.yaml                       # two apps
├── pubsub.http
├── README.md
├── resources/
│   ├── pubsub.yaml
│   ├── resiliency.yaml
│   └── subscription.yaml           # declarative only (orders + orders-deadletter)
├── <ProjectRoot>.Contracts/        # classlib: OrderPlaced, PubSubNames
│   └── <ProjectRoot>.Contracts.csproj
├── <ProjectRoot>.Publisher/        # web: OrderPublisher, POST /orders
│   ├── <ProjectRoot>.Publisher.csproj
│   ├── Program.cs
│   ├── OrderPublisher.cs
│   └── Properties/launchSettings.json   # http://localhost:5110
└── <ProjectRoot>.Subscriber/       # web: endpoints or handler classes
    ├── <ProjectRoot>.Subscriber.csproj
    ├── Program.cs
    ├── OrderPlacedHandler.cs
    └── Properties/launchSettings.json   # http://localhost:5120
```

### Dapr CLI, single role

Same tree with one service project (`<ProjectRoot>.Publisher` or `<ProjectRoot>.Subscriber`), no `.Contracts` project and no second `dapr.yaml` entry. `OrderPlaced` and `PubSubNames` live in the project's `Models/` folder (namespace `<ProjectRoot>.<Role>`, folder `Models/`). `subscription.yaml` exists only for a declarative subscriber; `pubsub.http` keeps only the requests that apply.

### Aspire, role both

```text
<ProjectRoot>/
├── .gitignore
├── <ProjectRoot>.sln               # written by `aspire new`
├── pubsub.http
├── README.md
├── <ProjectRoot>.AppHost/
│   ├── AppHost.cs
│   ├── <ProjectRoot>.AppHost.csproj
│   └── Resources/
│       ├── pubsub.yaml
│       ├── resiliency.yaml
│       └── subscription.yaml       # declarative only
├── <ProjectRoot>.ServiceDefaults/
├── <ProjectRoot>.Contracts/
├── <ProjectRoot>.Publisher/
└── <ProjectRoot>.Subscriber/
```

There is no `dapr.yaml` and no root `resources/` folder. The `Resources/*.yaml` files are copied to the output directory (see the AppHost `.csproj` in [`../dapr-shared/dotnet-aspire-dapr-wiring.md`](../dapr-shared/dotnet-aspire-dapr-wiring.md)).

### Streaming subscriber

```text
<ProjectRoot>/
├── dapr.yaml                       # subscriber entry has NO appPort
├── resources/
│   ├── pubsub.yaml
│   └── resiliency.yaml             # no subscription.yaml
└── <ProjectRoot>.Subscriber/
    ├── <ProjectRoot>.Subscriber.csproj   # Dapr.Messaging 1.18.10, no Dapr.AspNetCore
    ├── Program.cs                  # AddDaprMessaging(...), no Map* calls
    └── OrderPlacedHandler.cs       # ITopicHandler<OrderPlaced>
```

The streaming subscriber has no `subscription.yaml` (the subscription lives in the `[DaprTopic]` attribute) and no `appPort`; the publisher entry keeps its `appPort` 5110. The subscriber app reaches the sidecar over gRPC using `DAPR_GRPC_PORT`, which `dapr run` injects.

## Program.cs per type and style

Each row names the section to copy from `../dapr-shared/`.

| Service | Type and style | Copy from |
|---|---|---|
| Subscriber | declarative, minimal API | [`dotnet-pubsub-subscriber-declarative.md`](../dapr-shared/dotnet-pubsub-subscriber-declarative.md) → **Minimal API form** |
| Subscriber | declarative, controllers | [`dotnet-pubsub-subscriber-declarative.md`](../dapr-shared/dotnet-pubsub-subscriber-declarative.md) → **Controller form** |
| Subscriber | programmatic, minimal API | [`dotnet-pubsub-subscriber-programmatic.md`](../dapr-shared/dotnet-pubsub-subscriber-programmatic.md) → **Minimal API form** |
| Subscriber | programmatic, controllers | [`dotnet-pubsub-subscriber-programmatic.md`](../dapr-shared/dotnet-pubsub-subscriber-programmatic.md) → **Controller form** |
| Subscriber | streaming (handler class, no style choice) | [`dotnet-pubsub-messaging.md`](../dapr-shared/dotnet-pubsub-messaging.md) → **Streaming subscriber** |
| Publisher | minimal API / controllers | [`dotnet-pubsub-publisher.md`](../dapr-shared/dotnet-pubsub-publisher.md) → **Publish endpoint (minimal API)** / **Publish endpoint (controller)**, plus **Registration** and **OrderPublisher** |

Rules that apply to every row:

- Namespaces: `<ProjectNamespace>` is `<ProjectRoot>.<Role>` (Contracts: `<ProjectRoot>.Contracts`). Each web project's `.csproj` carries `<Using Include="<ProjectRoot>.Contracts" />` (role both) and `<Using Include="<ProjectRoot>.<Role>" />`, so the top-level-statement `Program.cs` and the Contracts types resolve without `using` lines.

- The handler logic is [`dotnet-pubsub-handler.md`](../dapr-shared/dotnet-pubsub-handler.md) → **OrderPlacedHandler** and **Dead-letter handler**. The streaming handler maps the same decisions to `TopicResponseAction`. A streaming subscriber copies only `IProcessedOrders` and `InMemoryProcessedOrders` from that file; its handlers are the `[DaprTopic]` classes in `dotnet-pubsub-messaging.md`.
- Declarative and programmatic subscribers call `app.UseCloudEvents()` before any `Map*` subscriber route. Without it the typed body binds the CloudEvent envelope and every field is null.
- A declarative subscriber has no `MapSubscribeHandler`, `WithTopic` or `[Topic]`: the subscription is the YAML file. A programmatic subscriber adds `MapSubscribeHandler()` and `WithTopic`/`[Topic]`, and has no `subscription.yaml`. A topic is subscribed through one type only.
- Controllers: add `builder.Services.AddControllers()` and `app.MapControllers()`; a programmatic controller subscriber uses `AddControllers().AddDapr()`; a declarative one adds `.AddDapr()` only when the same project also publishes.
- A publisher with `both` + streaming still asks the minimal API / controllers question, because it applies to the publisher endpoint.
- Streaming project: the build prints warning `DAPR1612` (the message type is not in a `JsonSerializerContext`). It only matters for AOT and is harmless.

## Aspire specifics

- ServiceDefaults calls in both web projects: `builder.AddServiceDefaults();` before `builder.Build()` and `app.MapDefaultEndpoints();` after it.
- `DaprSidecarOptions.AppId` is set explicitly to `<root-kebab>-publisher` and `<root-kebab>-subscriber`. It MUST equal the `scopes` value in `Resources/subscription.yaml`; otherwise Aspire derives the id from the resource name and a declarative subscriber receives nothing.
- A streaming subscriber needs no extra AppHost settings. Aspire may pass an HTTP port as the app port, which streaming ignores.
- The `pubsub.http` file uses the ports from each project's `launchSettings.json` (Aspire may assign other ports at run time; read them from the Aspire dashboard if a request fails). The `@daprHost` variable needs the sidecar HTTP port shown in the Aspire dashboard.
- The Dev Dashboard resource (`dapr-dev-dashboard`) is part of the AppHost template; it fails to start without affecting the app when the dashboard is not installed.

## Routing, TTL and raw payload

Add these only when the user asked for them. They are rows of the compatibility matrix in [`../dapr-shared/pubsub-concepts.md`](../dapr-shared/pubsub-concepts.md) → **Feature compatibility matrix**.

| Feature | Declarative | Programmatic | Streaming |
|---|---|---|---|
| CEL routing | `routes.rules[{match, path}]` plus `routes.default` in `subscription.yaml` ([`dapr-pubsub-subscription.md`](../dapr-shared/dapr-pubsub-subscription.md) → **With routing rules**), and a second endpoint at `/events/pubsub/orders/<rule-name>` (see **Routing rules** in the declarative file) | `TopicOptions.Match` / `Priority` (minimal API) or `[Topic(pubsub, topic, match, priority)]` (controllers); see **Routing rules** in the programmatic file | Not supported. Offer a declarative subscription instead (default yes) |
| Message TTL | Publisher side: `ttlInSeconds` metadata in `OrderPublisher` (see the publisher file), so it works with every type | same | same |
| Raw payload | `spec.metadata.rawPayload: "true"` ([`dapr-pubsub-subscription.md`](../dapr-shared/dapr-pubsub-subscription.md) → **With raw payload**); no code change | `EnableRawPayload = true` or `[Topic(pubsub, topic, true)]` | `[DaprTopic(EnableRawPayload = true)]` |

The metadata key is always `rawPayload`, never `isRawPayload`.

## README key points

Local-only items to list in the README, so the user knows what to change before production:

- The Redis password is empty (Aspire: the `cache-password` parameter default). That is safe only for local development; use a secret store for real environments.
- The subscription has no extra `scopes` beyond the subscriber app id (declarative) and the broker stream is not trimmed (Redis `maxLenApprox` is not set); both are fine locally.
- The in-memory idempotency set in the handler resets on restart. Use a durable store for real deduplication, because pub/sub delivery is at-least-once.
- Declarative only: `subscription.yaml` hot-reloads while the app runs. Programmatic subscriptions are read once at start-up, so a change needs a restart.
- **Switching the message broker** (README paragraph, always included): any supported broker works by replacing the component file (`resources/pubsub.yaml`; Aspire: `Resources/pubsub.yaml`) with that broker's component, for example a `pubsub.kafka` component, while keeping `metadata.name: pubsub`. No code changes are needed because the code only uses the name `pubsub`. The local default stays Redis. Link https://docs.dapr.io/reference/components-reference/supported-pubsub/ for the metadata of each broker, and never put secrets inline: use `secretKeyRef`. When the user asked for another broker, add: "You asked for <broker>; this scaffold runs on Redis locally so it works without extra infrastructure."
- Streaming subscribers have no inbound port, so `GET /dapr/subscribe` does not apply; use `GET /v1.0/metadata` or the Dev Dashboard instead.

## Worked example

Prompt: "Create a pub/sub app called OrderFlow in .NET with a declarative subscriber, using the Dapr CLI and minimal APIs." Resolved choices: role both, declarative, dapr run, minimal APIs, dead-letter on.

Files:

```text
OrderFlow/.gitignore
OrderFlow/OrderFlow.slnx
OrderFlow/dapr.yaml
OrderFlow/pubsub.http
OrderFlow/README.md
OrderFlow/resources/pubsub.yaml
OrderFlow/resources/resiliency.yaml
OrderFlow/resources/subscription.yaml
OrderFlow/OrderFlow.Contracts/OrderFlow.Contracts.csproj
OrderFlow/OrderFlow.Contracts/OrderPlaced.cs
OrderFlow/OrderFlow.Contracts/PubSubNames.cs
OrderFlow/OrderFlow.Publisher/OrderFlow.Publisher.csproj
OrderFlow/OrderFlow.Publisher/Program.cs
OrderFlow/OrderFlow.Publisher/OrderPublisher.cs
OrderFlow/OrderFlow.Publisher/Properties/launchSettings.json
OrderFlow/OrderFlow.Subscriber/OrderFlow.Subscriber.csproj
OrderFlow/OrderFlow.Subscriber/Program.cs
OrderFlow/OrderFlow.Subscriber/OrderPlacedHandler.cs
OrderFlow/OrderFlow.Subscriber/Properties/launchSettings.json
```

`dapr.yaml` app entries:

```yaml
apps:
  - appID: orderflow-publisher
    appDirPath: OrderFlow.Publisher
    appPort: 5110
    daprHTTPPort: 3510
    daprGRPCPort: 50010
    command: ["dotnet", "run"]
  - appID: orderflow-subscriber
    appDirPath: OrderFlow.Subscriber
    appPort: 5120
    daprHTTPPort: 3520
    daprGRPCPort: 50020
    command: ["dotnet", "run"]
```

`resources/subscription.yaml` (the `scopes` value equals the subscriber `appID`):

```yaml
apiVersion: dapr.io/v2alpha1
kind: Subscription
metadata:
  name: orders-subscription
spec:
  pubsubname: pubsub
  topic: orders
  routes:
    default: /events/pubsub/orders
  deadLetterTopic: orders-deadletter
scopes:
  - orderflow-subscriber
---
apiVersion: dapr.io/v2alpha1
kind: Subscription
metadata:
  name: orders-deadletter-subscription
spec:
  pubsubname: pubsub
  topic: orders-deadletter
  routes:
    default: /events/pubsub/orders-deadletter
scopes:
  - orderflow-subscriber
```

Check: `dotnet build "OrderFlow.slnx"` succeeds (`dotnet new sln --format slnx` writes `.slnx`; Aspire mode builds `<ProjectRoot>.sln`). After `dapr run -f .`, `POST http://localhost:5110/orders` (first request in `pubsub.http`) makes the subscriber log `Order <id> received`.
