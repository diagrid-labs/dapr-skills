using System.Net.Http.Json;
using Dapr.Workflow;
using ShipmentTracking.Models;

namespace ShipmentTracking.Activities;

internal sealed partial class SendTrackingEmailActivity(
    IHttpClientFactory httpClientFactory,
    IHostApplicationLifetime lifetime,
    ILogger<SendTrackingEmailActivity> logger) : WorkflowActivity<TrackingNotification, NotificationResult>
{
    public override async Task<NotificationResult> RunAsync(WorkflowActivityContext context, TrackingNotification input)
    {
        var client = httpClientFactory.CreateClient("email");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v3/mail/send")
        {
            Content = JsonContent.Create(new
            {
                to = input.CustomerEmail,
                template = "shipment-tracking",
                input.OrderId,
                input.TrackingNumber
            })
        };
        request.Headers.Add("Idempotency-Key", input.IdempotencyKey);

        using var response = await client.SendAsync(request, lifetime.ApplicationStopping);
        response.EnsureSuccessStatusCode();

        var messageId = response.Headers.TryGetValues("X-Message-Id", out var values)
            ? values.First()
            : Guid.NewGuid().ToString("N");

        LogSent(logger, input.OrderId, messageId);
        return new NotificationResult(messageId);
    }

    [LoggerMessage(LogLevel.Information, "Tracking email for order {OrderId} sent as {MessageId}")]
    static partial void LogSent(ILogger logger, string OrderId, string MessageId);
}
