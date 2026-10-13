using ProgrammaticApp;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers().AddDapr();
builder.Services.AddSingleton<IProcessedOrders, InMemoryProcessedOrders>();
builder.Services.AddSingleton<OrderPlacedHandler>();
builder.Services.AddSingleton<DeadLetterLogger>();

var app = builder.Build();

app.UseCloudEvents();
app.MapSubscribeHandler();
app.MapControllers();

app.Run();
