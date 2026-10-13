var builder = DistributedApplication.CreateBuilder(args);

builder.AddProject<Projects.Shop_Api>("shop-api");

builder.Build().Run();
