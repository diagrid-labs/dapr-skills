using System.Net.Http.Json;
using Dapr.Workflow;
using ShipmentTracking.Models;

namespace ShipmentTracking.Activities;

internal sealed partial class CreateShippingLabelActivity(
    IHttpClientFactory httpClientFactory,
    IHostApplicationLifetime lifetime,
    ILogger<CreateShippingLabelActivity> logger) : WorkflowActivity<LabelRequest, LabelResult>
{
    public override async Task<LabelResult> RunAsync(WorkflowActivityContext context, LabelRequest input)
    {
        var client = httpClientFactory.CreateClient("carrier");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/carriers/{input.Carrier}/labels")
        {
            Content = JsonContent.Create(new { input.OrderId })
        };
        request.Headers.Add("Idempotency-Key", input.IdempotencyKey);

        try
        {
            using var response = await client.SendAsync(request, lifetime.ApplicationStopping);
            response.EnsureSuccessStatusCode();
            var label = await response.Content.ReadFromJsonAsync<CarrierLabel>(lifetime.ApplicationStopping)
                ?? throw new InvalidOperationException("Carrier returned an empty label.");

            LogLabelCreated(logger, input.OrderId, label.TrackingNumber);
            return new LabelResult(label.Id, label.TrackingNumber, DateTime.UtcNow);
        }
        catch (HttpRequestException ex)
        {
            LogLabelFailed(logger, input.OrderId, ex.Message);
            throw;
        }
    }

    private sealed record CarrierLabel(string Id, string TrackingNumber);

    [LoggerMessage(LogLevel.Information, "Created label for order {OrderId} with tracking {TrackingNumber}")]
    static partial void LogLabelCreated(ILogger logger, string OrderId, string TrackingNumber);

    [LoggerMessage(LogLevel.Error, "Label creation for order {OrderId} failed: {Reason}")]
    static partial void LogLabelFailed(ILogger logger, string OrderId, string Reason);
}
