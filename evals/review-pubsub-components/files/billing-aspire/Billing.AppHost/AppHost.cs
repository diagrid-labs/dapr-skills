var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.Billing_Api>("billing-api")
    .WithDaprSidecar(new DaprSidecarOptions
    {
        AppId = "billing-api",
        ResourcesPaths = ["../Resources"]
    });

builder.AddProject<Projects.Billing_Subscriber>("billing-sub")
    .WithDaprSidecar(new DaprSidecarOptions
    {
        AppId = "billing-sub",
        ResourcesPaths = ["../Resources"]
    });

builder.Build().Run();
