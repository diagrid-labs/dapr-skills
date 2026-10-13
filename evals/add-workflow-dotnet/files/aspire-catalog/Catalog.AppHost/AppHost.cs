var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.Catalog_ApiService>("catalog-api");

builder.Build().Run();
