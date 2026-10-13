using StreamingApp;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IProcessedOrders, InMemoryProcessedOrders>();
builder.Services.AddDaprMessaging(options =>
    options.DaprGrpcEndpoint = $"http://localhost:{Environment.GetEnvironmentVariable("DAPR_GRPC_PORT") ?? "50001"}");

var app = builder.Build();

app.Run();
