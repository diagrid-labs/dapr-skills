# Reference: add Dapr Workflow to an existing .NET project

## Detection

| What | How |
|---|---|
| Scope | The folder or project the user named; otherwise the current directory, confirmed in one line. |
| Solution | `Glob` `*.sln` and `*.slnx` in the scope folder, then in each parent folder up to the drive root (`Glob` only searches downward, so check each parent folder separately); also `**/*.sln`/`**/*.slnx` below the scope folder. One solution → use it. Several → ask. None → use the project folder and build the project file instead. |
| ASP.NET Core projects | `Glob` `**/*.csproj`; keep those with `Sdk="Microsoft.NET.Sdk.Web"`. |
| Target framework | `<TargetFramework>` or `<TargetFrameworks>` in the `.csproj`, else `Directory.Build.props`. With several, all must be net8.0+; the package goes to all of them. If any listed target is below net8.0 (for example `net6.0;net8.0`), stop exactly like an unsupported single-target project and change nothing. |
| Hosting entry | `Startup.cs` containing `ConfigureServices` → Startup hosting; otherwise top-level `Program.cs`. |
| Endpoint style | `[ApiController]` classes or `AddControllers()` → controllers; `app.Map*(`/`MapGroup(` → minimal API. Both → follow the style of the endpoints closest to the new feature (ask if unclear). |
| Central Package Management | `Directory.Packages.props` with `<ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>` in the solution folder or a parent. |
| Existing Dapr | `Dapr.*` package references; `dapr.yaml`; folders named in its `resourcesPath` (often `resources/` or `components/`); component files with metadata `actorStateStore` set to `"true"` or `true` (both forms count). |
| Aspire | An AppHost project whose `.csproj` has a `ProjectReference` to the target project. An AppHost declares `Sdk="Aspire.AppHost.Sdk/<version>"`, a `<Sdk Name="Aspire.AppHost.Sdk" Version="<version>" />` element, or `<IsAspireHost>true</IsAspireHost>` (then the version is the `Aspire.Hosting.AppHost` package version). Aspire 9.x and 13.x are supported; for an older AppHost, say so and ask whether to use `dapr run` mode instead. |
| App port | `applicationUrl` of the `http` profile in `Properties/launchSettings.json`. If none, add an `http` profile on a free port (plan item). |
| Tests | Projects referencing the target project and `Microsoft.NET.Test.Sdk`. |

## Add Workflow Plan template

```markdown
## Add Workflow Plan — <ProjectName>

**Target:** `<solution path>` → `<project path>` (<TFM>, <minimal API | controllers>, <Program.cs | Startup.cs>)
**Hosting:** <dapr run | Aspire (AppHost: <AppHost project>)>
**Workflow:** <WorkflowName> — <one-line description, pattern>

### Packages
- `Dapr.Workflow` 1.18.10 → <.csproj | Directory.Packages.props>
- <Dapr.Client, Dapr.AspNetCore> <old version> → 1.18.10 (question 1)

### New files
- `<path>` — <purpose>

### Edited files
- `<path>` — <one-line edit description>

### Dapr wiring
- <dapr.yaml: new | append app entry | unchanged>; app port <port>, Dapr HTTP <port>, gRPC <port>
- State store: <new `<resources folder>/statestore.yaml` | reuse existing `<component name>` in `<path>`>

### Left unchanged
- `README.md`, existing endpoints (except the trigger endpoint, question 2), existing components, tests

### Checks
- Baseline test run before changes: yes (reply "no baseline" to skip)
- <Uncommitted changes found: the edits will mix with them.>

### Questions
1. Newer packages are available: <Dapr.Client 1.17.9 → 1.18.10, Dapr.AspNetCore 1.17.9 → 1.18.10>. Update them? **Default: yes, update.**
2. Should `<POST /orders>` also start `<WorkflowName>` after it saves the <order>? **Default: yes.** <(Default no: `<TestName>` calls this endpoint over HTTP and would need a running Dapr sidecar.)>

<Leave out a question that does not apply. Without a trigger endpoint, write instead: No existing endpoint starts the workflow; use the new start endpoint.>

Reply **yes** to apply with the defaults, answer a question differently (for example "1: no"), list items to drop, or **stop**.
```

## Package reference

- Per-project: `dotnet add "<project-path>" package Dapr.Workflow --version 1.18.10`.
- Central Package Management: add `<PackageVersion Include="Dapr.Workflow" Version="1.18.10" />` to `Directory.Packages.props` and `<PackageReference Include="Dapr.Workflow" />` (no version) to the `.csproj` with `Edit`. Do not run `dotnet add package` (it would write a version into the `.csproj`).
- Package updates (question 1, default yes): change the existing `Dapr.*` versions to 1.18.10 in the same place they are declared (`Directory.Packages.props` or the `.csproj`). Use `Edit`, not `dotnet add package`, so the version stays where it was. In Aspire mode an AppHost on Aspire 9.0–9.4 is updated to 9.5.2 the same way (SDK version and `Aspire.Hosting.*` packages).

## Dapr wiring (dapr run mode)

- No `dapr.yaml`: create one at the solution root:

  ```yaml
  version: 1
  common:
    resourcesPath: ./resources
  apps:
    - appID: <project-name-kebab>
      appDirPath: <relative path to the project folder>
      appPort: <app port>
      daprHTTPPort: <free port, default 3555>
      daprGRPCPort: <free port, default 50055>
      command: ["dotnet", "run"]
  ```

  and `resources/statestore.yaml` from [`../dapr-shared/dapr-statestore.md`](../dapr-shared/dapr-statestore.md).
- `dapr.yaml` exists with this app: leave it unchanged.
- `dapr.yaml` exists without this app: append an entry under `apps:` with ports not used by the other entries.
- An existing component has `actorStateStore: "true"`: reuse it and do not create another state store. Workflow state goes to that store.
- Components exist (a `resourcesPath` folder or a `components/`/`resources/` folder) but none has `actorStateStore: "true"`: add `statestore.yaml` from [`../dapr-shared/dapr-statestore.md`](../dapr-shared/dapr-statestore.md) to that existing folder (not a new `resources/` folder). If a component already uses its name, pick another (for example `workflow-store`). Without an actor state store the app builds but every workflow fails at runtime.

## Requests file

The shared [`../dapr-shared/dotnet-local-http.md`](../dapr-shared/dotnet-local-http.md) shows root-level routes. When the endpoints are mapped under a `/workflows/<workflow-route>` group or a controller route, the `.http` requests must use that prefix (for example `/workflows/place-order/start`).

## DAPR-WORKFLOW.md template

```markdown
# Dapr Workflow in <ProjectName>

## What was added
- <bullet per added or edited file, one line each>

## Run it
<`dapr run -f .` from the solution root | `aspire run` from the solution root> — <one line on what starts>.

## Try it
<When the trigger endpoint starts the workflow (question 2 yes): one line saying that `<POST /orders>` now starts `<WorkflowName>` with the <order> id as instance id, and a curl example for it. Then curl examples for start and status; link to the .http file>

<Diagrid Dapr Dev Dashboard section from the README section of [../dapr-shared/dev-dashboard.md](../dapr-shared/dev-dashboard.md) — Aspire form in Aspire mode>

## Run with Diagrid Catalyst
<`dapr run` mode only — omit this section in Aspire mode, which has no `dapr.yaml`. Content from [../dapr-shared/running-with-catalyst.md](../dapr-shared/running-with-catalyst.md), with `<ProjectName>` replaced by the target project name in lowercase.>

## Next steps
- Review the new workflow code with `review-workflow-determinism`, `review-workflow-activity` and `review-workflow-management`.
```

## Edge cases

- Port already used by another app in `dapr.yaml`: take the next free port and state it in the plan.
- Trigger endpoint declined (question 2 answered no): leave it unchanged and add a "Start the workflow from `<endpoint>`" next step to `DAPR-WORKFLOW.md`.
- Package updates declined (question 1 answered no): keep `Dapr.Workflow` 1.18.10 and add a warning about mixed `Dapr.*` versions to `DAPR-WORKFLOW.md`.
- Windows path-length errors (`path longer than allowed`, `os error 206`) during build or restore: report them and suggest a shorter path or enabling long paths. Never map drives (`subst`) or move build output.
- `Startup.cs` hosts: follow "Adding to an existing Program.cs" in [`../dapr-shared/dotnet-workflow-endpoints.md`](../dapr-shared/dotnet-workflow-endpoints.md) (`ConfigureServices` / `UseEndpoints`).

## Worked example

For the `orders-api` layout (net8 minimal API with `OrderService`, tests in `tests/OrdersApi.Tests`):

- Plan: target `OrdersApi.slnx` → `src/OrdersApi` (net8.0, minimal API, Program.cs), dapr run, workflow `PlaceOrderWorkflow` (task chaining).
- Package: `dotnet add "src/OrdersApi/OrdersApi.csproj" package Dapr.Workflow --version 1.18.10`.
- New files: `src/OrdersApi/Workflows/PlaceOrderWorkflow.cs`, `src/OrdersApi/Activities/ReserveStockActivity.cs`, `ChargePaymentActivity.cs`, `SendConfirmationActivity.cs`, `src/OrdersApi/Models/PlaceOrderInput.cs`, `PlaceOrderOutput.cs`, `src/OrdersApi/OrdersApi.workflow.http`, `dapr.yaml`, `resources/statestore.yaml`, `DAPR-WORKFLOW.md`.
- Edited: `src/OrdersApi/OrdersApi.csproj` (package), `src/OrdersApi/Program.cs` — after `builder.Services.AddSingleton<OrderService>();` add `builder.Services.AddDaprWorkflow();` and `builder.Services.AddDaprWorkflowVersioning();`; after `app.MapPost("/orders", ...)` add the workflow endpoints under `app.MapGroup("/workflows/place-order")`.
- Questions: no newer packages (the project has no `Dapr.*` package yet), so only question 2: "Should `POST /orders` also start `PlaceOrderWorkflow` after it saves the order? Default: yes." The tests only call `OrderService` directly, so the default stays yes. With yes, the `POST /orders` handler gains a `DaprWorkflowClient workflowClient` parameter and calls `ScheduleNewWorkflowAsync(nameof(PlaceOrderWorkflow), order.Id, new PlaceOrderInput(order))` after `orders.Add(order)`; its `Results.Created(...)` response is unchanged.
- Requests file: because the endpoints sit under the `/workflows/place-order` group, the `.http` requests use that prefix. In an existing project the workflow endpoints always go under a `/workflows/<route>` group so they don't collide with the project's own routes.
- `dapr.yaml`: appID `orders-api`, appDirPath `src/OrdersApi`, appPort 5180, daprHTTPPort 3555, daprGRPCPort 50055.
