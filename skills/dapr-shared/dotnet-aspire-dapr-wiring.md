# Aspire Dapr wiring (.NET)

The AppHost wiring for Dapr (sidecar, Valkey state store, component YAML, Dev Dashboard) used by the `create-workflow-aspire` and `add-workflow-dotnet` skills.

## AppHost.cs (new solution)

The AppHost orchestrates all resources: Dapr, Valkey cache, the ApiService with a Dapr sidecar, and the locally installed Diagrid Dapr Dev Dashboard.

```csharp
using System.Reflection;
using CommunityToolkit.Aspire.Hosting.Dapr;

var builder = DistributedApplication.CreateBuilder(args);

builder.AddDapr();

string executingPath = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)
    ?? throw new("Where am I?");

var cachePassword = builder.AddParameter("cache-password", "state-store-123", secret: true);
var cache = builder
    .AddValkey("cache", 16379, cachePassword)
    .WithContainerName("workflow-state")
    .WithDataVolume("workflow-state-data");

var apiService = builder
    .AddProject<Projects.<SolutionRoot>_ApiService>("apiservice")
    .WithDaprSidecar(new DaprSidecarOptions
    {
        LogLevel = "debug",
        ResourcesPaths =
        [
            Path.Join(executingPath, "Resources"),
        ],
    });

apiService.WaitFor(cache);

builder.AddExecutable("dapr-dev-dashboard", "diagrid-dev-dashboard", ".",
        "--port", "9090", "--no-open")
    .WithHttpEndpoint(port: 9090, isProxied: false);

builder.Build().Run();
```

### Key points

- `AddDapr()` registers the Dapr hosting integration with Aspire.
- `AddValkey("cache", 16379, cachePassword)` creates a Valkey container on port 16379, replacing the Redis that `dapr init` would normally provide.
- `WithDaprSidecar()` attaches a Dapr sidecar to the ApiService. The `ResourcesPaths` option points to the `Resources` folder containing component YAML files.
- `apiService.WaitFor(cache)` ensures the Valkey container is ready before the ApiService starts.
- The [Diagrid Dapr Dev Dashboard](https://github.com/diagridio/dev-dashboard) runs as an executable resource (`AddExecutable`): Aspire starts the locally installed `diagrid-dev-dashboard` binary on port 9090 (its default), and `--no-open` stops it from opening its own browser tab. `isProxied: false` keeps the real port, so http://localhost:9090 works directly.
- The dashboard is optional and installed by the user (install commands in [`./dev-dashboard.md`](./dev-dashboard.md)). If it is not installed, only the `dapr-dev-dashboard` resource fails to start; the ApiService, its sidecar and Valkey run normally.
- It discovers the Aspire-managed sidecar itself. If its Workflows page shows no instances, add `"--statestore", Path.Join(executingPath, "Resources", "statestore.yaml")` to the arguments.
- Replace `<SolutionRoot>` with the actual solution name (e.g., `Projects.MyApp_ApiService`).

## AppHost .csproj

```xml
<Project Sdk="Aspire.AppHost.Sdk/<AspireVersion>">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <UserSecretsId>auto-generated-id</UserSecretsId>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="..\<SolutionRoot>.ApiService\<SolutionRoot>.ApiService.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Aspire.Hosting.Valkey" Version="<AspireVersion>" />
    <PackageReference Include="CommunityToolkit.Aspire.Hosting.Dapr" Version="13.0.0" />
  </ItemGroup>

  <ItemGroup>
    <Content Include="Resources\**\*.*">
      <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
      <Link>Resources\%(RecursiveDir)%(Filename)%(Extension)</Link>
    </Content>
  </ItemGroup>

</Project>
```

### Key points

- Uses `Aspire.AppHost.Sdk/<AspireVersion>` instead of the standard .NET SDK. `<AspireVersion>` is the version `aspire new` writes into the `Sdk` attribute (e.g. `13.6.1`); keep it unchanged.
- Keep the scaffolded `PropertyGroup` as generated. Newer templates may add properties not shown here (e.g. `<AspireUseCliBundle>true</AspireUseCliBundle>`); do not remove them.
- `Aspire.Hosting.Valkey` uses the same `<AspireVersion>` as the AppHost SDK so all Aspire hosting packages stay on one release.
- `CommunityToolkit.Aspire.Hosting.Dapr` provides the `AddDapr()` and `WithDaprSidecar()` extension methods.
- `Aspire.Hosting.Valkey` provides the `AddValkey()` extension method.
- The `Content` item group copies the `Resources` folder (containing Dapr component YAML files) to the build output directory.
- Remove any project reference to the Web project that was deleted during scaffolding.

## Resources/statestore.yaml

State store component used by the workflow in ApiService:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: workflow-store
spec:
  type: state.redis
  version: v1
  metadata:
    - name: redisHost
      value: "localhost:16379"
    - name: redisPassword
      value: "state-store-123"
    - name: actorStateStore
      value: true
```

### Key points

- `redisHost` uses `localhost:16379` because the Dapr sidecar runs on the host and the Valkey container exposes port 16379.
- `redisPassword` must match the password configured in `AppHost.cs` via `AddParameter("cache-password", ...)`.
- `actorStateStore` must be `true` because Dapr Workflow uses the actor framework internally.
- The component name `workflow-store` is used by the Dapr runtime to identify this state store.

## Adding to an existing AppHost

Use this when the solution already has an AppHost. Edit it; never replace it.

1. `.csproj`: add `<PackageReference Include="CommunityToolkit.Aspire.Hosting.Dapr" Version="<ToolkitVersion>" />` — `13.0.0` for Aspire 13.x, `9.9.0` for Aspire 9.5 or later 9.x (it needs `Aspire.Hosting` 9.5.2; for Aspire 9.0–9.4, put "upgrade the AppHost to Aspire 9.5" in the plan as its own item) — and, only when adding a new Valkey resource (step 2), `<PackageReference Include="Aspire.Hosting.Valkey" Version="<AspireVersion>" />`, where `<AspireVersion>` is the AppHost's Aspire version (from `Sdk="Aspire.AppHost.Sdk/<AspireVersion>"`, `<Sdk Name="Aspire.AppHost.Sdk" Version="<AspireVersion>" />`, or the `Aspire.Hosting.AppHost` package version). With Central Package Management, add `PackageVersion` entries to `Directory.Packages.props` and version-less references to the `.csproj`. Add the `Content Include="Resources\**\*.*"` item group from `## AppHost .csproj` and create `Resources/statestore.yaml` from `## Resources/statestore.yaml`.
2. `AppHost.cs` (or `Program.cs`): add `using CommunityToolkit.Aspire.Hosting.Dapr;` and `using System.Reflection;` when missing, `builder.AddDapr();` after `CreateBuilder` (skip it if the AppHost already calls it), the `executingPath` line, the `cache-password` parameter and `AddValkey("cache", 16379, cachePassword)` resource — unless the AppHost already has a Redis or Valkey resource; then reuse it and point `Resources/statestore.yaml` at its host port and password. Declare `executingPath`, the `cache-password` parameter and the cache resource before the `AddProject<...>` call that step 3 extends.
3. Keep the existing `AddProject<...>("<existing-name>")` call and its resource name; chain `.WithDaprSidecar(new DaprSidecarOptions { ResourcesPaths = [Path.Join(executingPath, "Resources")] })` and `.WaitFor(cache)` onto it (use the existing cache resource's variable; if it was added inline without one, assign it to a variable first). Never rename the resource.
4. Add the Dev Dashboard executable resource exactly as in `## AppHost.cs (new solution)`, before `builder.Build().Run();`. Skip this step if the AppHost already has a `dapr-dev-dashboard` resource; if another resource already uses port 9090, say so in the plan and use the next free port in both `--port` and `WithHttpEndpoint(port: ...)`.
5. Do not create a `dapr.yaml`: Aspire starts the sidecar.
