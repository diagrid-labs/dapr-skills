# Reference: add Dapr pub/sub to an existing .NET project

## Detection

| What | How |
|---|---|
| Scope | The folder or project the user named; otherwise the current directory, confirmed in one line. |
| Solution | `Glob` `*.sln` and `*.slnx` in the scope folder, then in each parent folder up to the drive root (`Glob` only searches downward, so check each parent folder separately); also `**/*.sln`/`**/*.slnx` below the scope folder. One solution → use it. Several → ask. None → the project folder is the root: build the project file, and put `dapr.yaml` (`appDirPath: .`), `resources/`, the `.http` file and `DAPR-PUBSUB.md` there; the final message says "project root". |
| ASP.NET Core projects | `Glob` `**/*.csproj`; keep those with `Sdk="Microsoft.NET.Sdk.Web"`. |
| Target framework | `<TargetFramework>` or `<TargetFrameworks>` in the `.csproj`, else `Directory.Build.props`. With several, all must be net8.0+; the package goes to all of them. If any listed target is below net8.0 (for example `net6.0;net8.0`), stop exactly like an unsupported single-target project and change nothing. |
| Hosting entry | `Startup.cs` containing `ConfigureServices` → Startup hosting; otherwise top-level `Program.cs`. |
| Endpoint style | `[ApiController]` classes or `AddControllers()` → controllers; `app.Map*(`/`MapGroup(` → minimal API. Both → follow the style of the endpoints closest to the new feature (ask if unclear). `MapSubscribeHandler()` discovers both forms. |
| Central Package Management | `Directory.Packages.props` with `<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>` in the solution folder or a parent. |
| Aspire | An AppHost project whose `.csproj` has a `ProjectReference` to the target project. An AppHost declares `Sdk="Aspire.AppHost.Sdk/<version>"`, a `<Sdk Name="Aspire.AppHost.Sdk" Version="<version>" />` element, or `<IsAspireHost>true</IsAspireHost>` (then the version is the `Aspire.Hosting.AppHost` package version). Aspire 9.x and 13.x are supported; for an older AppHost, say so and ask whether to use `dapr run` mode instead. |
| App port | `applicationUrl` of the `http` profile in `Properties/launchSettings.json`. If none, add an `http` profile on a free port (plan item). |
| Trigger endpoint | An existing `MapPost`/`[HttpPost]` that creates or accepts the thing the event is about. Remember whether a test calls it over HTTP (`WebApplicationFactory`, `HttpClient`). |
| Tests | Projects referencing the target project and `Microsoft.NET.Test.Sdk`. |

### Pub/sub rows

| What | How |
|---|---|
| Dapr packages | `Dapr.AspNetCore`, `Dapr.Client`, `Dapr.Messaging` references and versions, in the `.csproj` and `Directory.Packages.props`. Any below 1.18.10 → newer packages available (question 1). |
| Client registration | `Grep` `AddDaprClient(` and `.AddDapr(`. Either one present → reuse it, add nothing. |
| CloudEvents middleware | `Grep` `UseCloudEvents(`. Present but after `UseEndpoints(` (or after a terminal `app.Run(` delegate) → plan item "move `UseCloudEvents()`". |
| Subscribe wiring | `Grep` `MapSubscribeHandler(`, `AddDaprMessaging(`, `MapDaprMessaging(`. Present → reuse, never duplicate. |
| Subscribed pairs | Every `(pubsub, topic)` from the markers below. Needed to detect clashes. |
| Components | `Glob` `**/*.yaml` and `**/*.yml`; files with `type: pubsub.` (name, type, `scopes`) and files with `kind: Resiliency`. Also the folders named in `dapr.yaml` `resourcesPath` and the AppHost `Resources/` folder. A component named `pubsub` that has a `state.*` type → name the new one `<TopicName>-pubsub`. |
| Dapr run files | `dapr.yaml` and its apps, with their `appID`, `appPort`, `daprHTTPPort` and `daprGRPCPort` values. |
| Publish calls | `Grep` `PublishEventAsync(`, `PublishByteEventAsync(`, `IDaprPublishSubscribeClient`. Existing publishing keeps working; reuse its pubsub name. |

### Subscription type markers

| Marker | Type | What the skill does |
|---|---|---|
| `[Topic(` or `.WithTopic(` | programmatic | Keep programmatic. |
| `kind: Subscription` YAML whose `scopes` include this app-id, or that has no `scopes` | declarative | Follow it. |
| `[DaprTopic(` | `Dapr.Messaging` | Use the same `Delivery` value as the existing handlers: Streaming, or Http/Programmatic (see `Following an existing Http or Programmatic delivery project` in [`../dapr-shared/dotnet-pubsub-messaging.md`](../dapr-shared/dotnet-pubsub-messaging.md)). |
| More than one type | mixed | Ask which type to use for the new topic. The default is the type with the most subscriptions. |

A Subscription file whose `scopes` do not include this app-id is not a marker for this app (see `## Clashes and mixed types`).

## Add Pub/Sub Plan template

```markdown
## Add Pub/Sub Plan — <ProjectName>

**Target:** `<solution>` → `<project>` (<TFM>, <minimal API | controllers>, <Program.cs | Startup.cs>)
**Hosting:** <dapr run | Aspire (AppHost: <name>)>
**Role:** <publisher | subscriber | both>
**Subscription type:** <declarative | programmatic | streaming> — <default | follows existing <marker> | requested>

### Topics
| Pub/sub | Topic | Type | Route or handler | Dead-letter |
|---|---|---|---|---|

### Packages
- <`Dapr.AspNetCore` 1.18.10 (publisher, declarative, programmatic)> → <.csproj | Directory.Packages.props>
- <`Dapr.Messaging` 1.18.10 (streaming)>

### New files
- `<path>` — <purpose>

### Edited files
- `<path>` — <one-line edit>

### Dapr wiring
- dapr.yaml: <new | append app entry | unchanged>; app port <p>, Dapr HTTP <p>, gRPC <p>
- Pub/sub component: <new `<folder>/pubsub.yaml` | reuse `<name>` in `<path>`>
- Resiliency: <new | append target | unchanged>
- Subscription file: <new `<folder>/subscription.yaml` scoped to `<app-id>` | none>

### Left unchanged
- `README.md`, existing endpoints (except question 2), existing components and subscriptions, tests

### Checks
- Baseline test run before changes: yes (reply "no baseline" to skip)
- <Uncommitted changes found: the edits will mix with them.>

### Risk
- <Only when question 2 is Yes and an existing test calls the trigger endpoint over HTTP: `<test file / test names>` call `<trigger endpoint>` and will need a Dapr sidecar or a test double for the publisher (replace or override the registered `<EventName>Publisher`). This skill does not edit tests.>

### Questions
1. Newer packages are available: <list>. Update them? **Default: yes, update.**
2. Should `<trigger endpoint>` also publish `<EventName>` after its existing work succeeds? **Default: yes.** <(Default no when the request does not ask to publish from this action and `<TestName>` calls this endpoint over HTTP: it would need a running Dapr sidecar. When the request explicitly asks to publish from a named action or endpoint, the default stays yes and the Risk section above names the test.)>

Reply **yes** to apply with the defaults, answer a question differently (for example "1: no"), list items to drop, or **stop**.
```

Leave out a question that does not apply. Without a trigger endpoint, write instead: No existing endpoint publishes the event; use the new `POST /pubsub/<PublishRoute>` endpoint. For the subscriber-only role, question 2 is never asked.

## Package reference

- Per-project: `dotnet add "<project-path>" package Dapr.AspNetCore --version 1.18.10` (and `Dapr.Messaging` the same way for streaming).
- Central Package Management: add `<PackageVersion Include="Dapr.AspNetCore" Version="1.18.10" />` (and `Dapr.Messaging`) to `Directory.Packages.props` and `<PackageReference Include="Dapr.AspNetCore" />` (no version) to the `.csproj` with `Edit`. Do not run `dotnet add package` (it would write a version into the `.csproj`).
- Never add `Dapr.Client` explicitly; it comes in through `Dapr.AspNetCore`. A streaming-only subscriber references `Dapr.Messaging` and not `Dapr.AspNetCore`; when the same project also publishes, use `IDaprPublishSubscribeClient` instead of `DaprClient` so one project uses one stack.
- Package updates (question 1, default yes): change the existing `Dapr.*` versions to 1.18.10 in the same place they are declared (`Directory.Packages.props` or the `.csproj`). Use `Edit`, not `dotnet add package`, so the version stays where it was. In Aspire mode an AppHost on Aspire 9.0–9.4 is updated to 9.5.2 the same way (SDK version and `Aspire.Hosting.*` packages).
- Streaming with `Dapr.Messaging` older than 1.18.8: the update to 1.18.10 is a required item. If declined, the plan switches to declarative.

## Wiring per subscription type

Apply the shared-file section in the cell, with the project's style (minimal API or controllers). `UseCloudEvents()` always goes before the first subscriber `Map*` route; in `Startup.cs` it goes after `UseRouting()` and before `UseEndpoints`.

| Type | Program.cs | Startup.cs |
|---|---|---|
| Declarative | [`dotnet-pubsub-subscriber-declarative.md`](../dapr-shared/dotnet-pubsub-subscriber-declarative.md) → **Minimal API form** or **Controller form**; `app.UseCloudEvents();` before the first `app.Map*`; plain `MapPost("<SubscribeRoute>", ...)` routes; no `MapSubscribeHandler`, `WithTopic` or `[Topic]`. YAML from [`dapr-pubsub-subscription.md`](../dapr-shared/dapr-pubsub-subscription.md), scoped to the app-id. | Same file → **Startup.cs placement**: `app.UseCloudEvents();` after `UseRouting()` and before `UseEndpoints`; routes via `endpoints.MapPost(...)`. |
| Programmatic | [`dotnet-pubsub-subscriber-programmatic.md`](../dapr-shared/dotnet-pubsub-subscriber-programmatic.md) → **Minimal API form** (`.WithTopic(...)`) or **Controller form** (`[Topic(...)]`); `app.UseCloudEvents(); app.MapSubscribeHandler();` before the first `app.Map*`, each only when missing. No Subscription file. | Same file → **Startup.cs placement**: `UseCloudEvents()` then `endpoints.MapSubscribeHandler()` inside `UseEndpoints`. |
| Streaming | [`dotnet-pubsub-messaging.md`](../dapr-shared/dotnet-pubsub-messaging.md) → **Streaming subscriber**: `builder.Services.AddDaprMessaging(o => o.DaprGrpcEndpoint = ...)` (exact line in the shared file) plus an `ITopicHandler<<EventName>>` class with `[DaprTopic(..., Delivery = DeliveryMode.Streaming)]`. No endpoint mapping, no `Route`/`Match`/`Priority`. Keep the app's existing `appPort`. Publisher role: an `<EventName>Publisher` injecting `IDaprPublishSubscribeClient` and calling `PublishEventAsync` on it (**Publishing with IDaprPublishSubscribeClient** in the same file), not the `DaprClient`-based publisher file; register `AddDaprMessaging()` only, no `AddDaprClient()`; in a mixed project follow the existing publisher's stack and never register both for the same purpose. Set `options.DaprGrpcEndpoint` from `DAPR_GRPC_PORT` exactly as in the shared file; a bare `AddDaprMessaging()` never opens the stream under `dapr run`. In Aspire mode confirm `DAPR_GRPC_PORT` is available to the app (see the shared file). | Same registration in `ConfigureServices`; nothing in `Configure`. |

Publisher registration for all types: [`dotnet-pubsub-publisher.md`](../dapr-shared/dotnet-pubsub-publisher.md) → **Registration** and **Adding to an existing Program.cs or Startup.cs**.

## Clashes and mixed types

Verbatim from the design (§9):

| Situation | Behaviour |
|---|---|
| **Mixed subscription types already in the app** | Allowed. Ask which type the new topic uses (default: the most-used type). The plan lists the type per topic. |
| **Same topic already subscribed (any type)** | Never add a second subscription. Ask whether to extend the existing handler or use another topic. |
| **Declarative YAML exists but its `scopes` do not include this app-id** | Do not reuse it. Add a new Subscription file scoped to this app. Report the mismatch in the plan as a finding (`DPS-CFG-011` when it matches no app at all). |
| **Hot reload** | Declarative changes apply without a restart (HotReload on by default). Programmatic changes need a sidecar restart. Both facts go in the run doc. If `features: HotReload enabled: false` is found in a Configuration, the run doc says that a restart is needed. |

## Edge cases

| Situation | Behaviour |
|---|---|
| Unsupported TFM (below net8.0, .NET Framework, or a multi-target list containing one) | Stop before planning. No changes. |
| Several candidate projects | Ask which one. |
| Existing pubsub component (any `pubsub.*`) | Reuse it, and use its name in `PubSubNames.PubSubName`. If there are several, ask. |
| Component named `pubsub` that is a `state.*` type | Name the new component `<TopicName>-pubsub`, and say so in the plan. |
| Existing `DaprClient` registration (`AddDaprClient(` or `.AddDapr(`) | Reuse it. |
| Existing `UseCloudEvents()` after `UseEndpoints` | Plan item to move it (fixes `DPS-SUB-003`). |
| Existing `MapSubscribeHandler()` or `AddDaprMessaging()` | Reuse it; never duplicate. |
| Streaming chosen and `Dapr.Messaging` is older than 1.18.8 | The update is a required plan item. If declined, fall back to declarative. |
| Streaming combined with routing | Offer declarative for that subscription (default yes). |
| Streaming chosen in an existing web app | Keep the app's `appPort`. Streaming ignores it. |
| Controllers and minimal APIs in one project | Follow the closest style, or ask. `MapSubscribeHandler()` discovers both forms. |
| Role `both` in one app | Allowed. The plan notes that the app receives its own events. |
| App-id or port already used | Use the next free value, and state it in the plan. |
| Existing `dapr.yaml` / resiliency file | Append to it; never replace it. |
| Older `Dapr.*` packages | Question 1. If declined, add a "Mixed `Dapr.*` versions" warning to `DAPR-PUBSUB.md`. |
| Trigger endpoint covered by an HTTP test | When the request explicitly asks to publish from a named action or endpoint (for example "when an order is created", "from POST /orders"), question 2 defaults to **yes** and the plan carries a **Risk** line naming the test file(s)/test(s), saying they will need a Dapr sidecar or a test double for the publisher (replace or override the registered `<EventName>Publisher`) and that the skill does not edit tests. When the request does not mention publishing from an existing action, question 2 defaults to no. If declined, leave it unchanged and add "Publish from `<endpoint>`" to Next steps in `DAPR-PUBSUB.md`. |
| Build fails after a step | Fix or undo that step, report it, and stop. |
| Tests fail at the end | Report them; never edit tests. If the baseline passed and a test that calls the changed endpoint now fails because of the publish call (timeout or connection to the sidecar, e.g. `DaprException`), report it as an expected consequence of the approved Risk line and name the one-line fix (a test double: replace or override the registered `<EventName>Publisher`); unrelated failures are regressions. |
| Long Windows paths (`path longer than allowed`, `os error 206`) | Report them, and suggest a shorter path or long-path support. Never use `subst`. |
| Aspire AppHost older than 9.5, or an existing Redis/Valkey resource | As in `## Pub/sub apps` and `## Adding to an existing AppHost` of [`../dapr-shared/dotnet-aspire-dapr-wiring.md`](../dapr-shared/dotnet-aspire-dapr-wiring.md). |

## Requests file

Follow [`../dapr-shared/pubsub-local-http.md`](../dapr-shared/pubsub-local-http.md). In an add skill the publish route is `/pubsub/<PublishRoute>`, or the existing trigger endpoint when question 2 was answered yes. Use the project's real ports (`launchSettings.json`, `dapr.yaml`).

## DAPR-PUBSUB.md

Use the template and the **Filling it in** rules in [`../dapr-shared/pubsub-run-doc.md`](../dapr-shared/pubsub-run-doc.md). `<StartCommand>` is `dapr run -f .` or `aspire run`; omit the Catalyst section in Aspire mode.

## Worked example

For the `shop-api` fixture (net8 minimal API with `OrderStore`, xUnit tests in `tests/ShopApi.Tests`, no Dapr yet). The request: "add Dapr pub/sub: when an order is placed, publish an order-placed event, and process those events in the same app".

### Plan

```markdown
## Add Pub/Sub Plan — ShopApi

**Target:** `ShopApi.slnx` → `src/ShopApi` (net8.0, minimal API, Program.cs)
**Hosting:** dapr run
**Role:** both
**Subscription type:** declarative — default

### Topics
| Pub/sub | Topic | Type | Route or handler | Dead-letter |
|---|---|---|---|---|
| pubsub | orders | declarative | `/events/pubsub/orders` | orders-deadletter (`/events/pubsub/orders-deadletter`) |

### Packages
- `Dapr.AspNetCore` 1.18.10 → `src/ShopApi/ShopApi.csproj`

### New files
- `src/ShopApi/Models/OrderPlaced.cs` — message contract
- `src/ShopApi/Models/PubSubNames.cs` — pubsub and topic names
- `src/ShopApi/Messaging/OrderPublisher.cs` — publishes `OrderPlaced` with `DaprClient`
- `src/ShopApi/Messaging/OrderPlacedHandler.cs` — order handler with duplicate check, plus the dead-letter logger
- `dapr.yaml` — app `shop-api`
- `resources/pubsub.yaml` — Redis pub/sub component `pubsub`
- `resources/resiliency.yaml` — inbound retry so failed messages are retried before dead-lettering
- `resources/subscription.yaml` — Subscriptions for `orders` and `orders-deadletter`, scoped to `shop-api`
- `src/ShopApi/ShopApi.pubsub.http` — requests file
- `DAPR-PUBSUB.md` — what changed and how to run it

### Edited files
- `src/ShopApi/ShopApi.csproj` — package reference
- `src/ShopApi/Program.cs` — registrations, `app.UseCloudEvents();`, subscriber routes; `POST /orders` publishes (question 2)

### Dapr wiring
- dapr.yaml: new; app port 5180, Dapr HTTP 3555, gRPC 50055
- Pub/sub component: new `resources/pubsub.yaml`
- Resiliency: new
- Subscription file: new `resources/subscription.yaml` scoped to `shop-api`

### Left unchanged
- `README.md`, existing endpoints (except question 2), existing components and subscriptions, tests

### Checks
- Baseline test run before changes: yes (reply "no baseline" to skip)

### Questions
1. (Not asked: the project has no `Dapr.*` package yet.)
2. Should `POST /orders` also publish `OrderPlaced` after it saves the order? **Default: yes.** The tests only call `OrderStore` directly, so the default stays yes and the plan has no Risk line.

Reply **yes** to apply with the defaults, answer a question differently (for example "2: no"), list items to drop, or **stop**.
```

### Edited `Program.cs`

After `builder.Services.AddSingleton<OrderStore>();` add:

```csharp
builder.Services.AddDaprClient();
builder.Services.AddSingleton<OrderPublisher>();
builder.Services.AddSingleton<IProcessedOrders, InMemoryProcessedOrders>();
builder.Services.AddSingleton<OrderPlacedHandler>();
builder.Services.AddSingleton<DeadLetterLogger>();
```

Directly after `var app = builder.Build();`, before the first `app.Map*`:

```csharp
app.UseCloudEvents();
```

The `POST /orders` handler gains the publisher and awaits it after `store.Add(order)`; its `Results.Created(...)` response is unchanged:

```csharp
app.MapPost("/orders", async (Order order, OrderStore store, OrderPublisher publisher, CancellationToken cancellationToken) =>
{
    store.Add(order);
    await publisher.PublishOrderPlacedAsync(
        new OrderPlaced(order.Id, order.CustomerId, order.Amount, DateTimeOffset.UtcNow), cancellationToken);
    return Results.Created($"/orders/{order.Id}", order);
});
```

After the last existing `app.Map*` call, add the subscriber routes:

```csharp
app.MapPost("/events/pubsub/orders",
    (HttpRequest request, OrderPlacedHandler handler, CancellationToken cancellationToken) =>
        handler.HandleAsync(request, cancellationToken));

app.MapPost("/events/pubsub/orders-deadletter",
    (HttpRequest request, DeadLetterLogger deadLetters, CancellationToken cancellationToken) =>
        deadLetters.HandleAsync(request, cancellationToken));
```

The new `using ShopApi.Models;` is already present; add `using ShopApi.Messaging;`. The files use the namespaces `ShopApi.Models` and `ShopApi.Messaging` in place of `<ProjectNamespace>`. There is no `MapSubscribeHandler()`: the YAML is the subscription.

### New files

- `src/ShopApi/Models/OrderPlaced.cs`, `PubSubNames.cs` — from [`dotnet-pubsub-publisher.md`](../dapr-shared/dotnet-pubsub-publisher.md) → **Message contract**.
- `src/ShopApi/Messaging/OrderPublisher.cs` — **OrderPublisher**.
- `src/ShopApi/Messaging/OrderPlacedHandler.cs` — `IProcessedOrders`, `InMemoryProcessedOrders`, `OrderPlacedHandler` and `DeadLetterLogger` from [`dotnet-pubsub-handler.md`](../dapr-shared/dotnet-pubsub-handler.md).
- `dapr.yaml`: appID `shop-api`, appDirPath `src/ShopApi`, appPort 5180 (the `launchSettings.json` port), daprHTTPPort 3555, daprGRPCPort 50055, command `["dotnet", "run"]`, `resourcesPath: ./resources`.
- `resources/subscription.yaml`: `scopes: [shop-api]`, the same string as the `appID`.
- `resources/pubsub.yaml`, `resources/resiliency.yaml`, `src/ShopApi/ShopApi.pubsub.http`, `DAPR-PUBSUB.md` — from the shared templates.
- Package: `dotnet add "src/ShopApi/ShopApi.csproj" package Dapr.AspNetCore --version 1.18.10`.

After each of the six steps run `dotnet build "ShopApi.slnx"`; at the end `dotnet test "ShopApi.slnx"` (2 tests pass).
