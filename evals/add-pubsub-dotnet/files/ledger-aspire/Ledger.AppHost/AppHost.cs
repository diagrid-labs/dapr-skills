using CommunityToolkit.Aspire.Hosting.Dapr;

var builder = DistributedApplication.CreateBuilder(args);

builder.AddDapr();

var executingPath = AppContext.BaseDirectory;

builder.AddProject<Projects.Ledger_ApiService>("apiservice")
    .WithDaprSidecar(new DaprSidecarOptions
    {
        AppId = "ledger-api",
        ResourcesPaths = [Path.Join(executingPath, "Resources")]
    });

builder.Build().Run();
