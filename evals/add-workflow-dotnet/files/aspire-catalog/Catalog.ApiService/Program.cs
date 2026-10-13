var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.MapGet("/products", () => new[] { new { Sku = "SKU-1", Name = "Kettle" } });

app.Run();
