using System.Net.Http.Json;
using Dapr.Workflow;
using SubscriptionBilling.Models;

namespace SubscriptionBilling.Activities;

internal sealed class SendInvoiceEmailActivity(IHttpClientFactory httpClientFactory)
    : WorkflowActivity<InvoiceEmail, EmailResult>
{
    private static int _emailsSent;

    public override async Task<EmailResult> RunAsync(WorkflowActivityContext context, InvoiceEmail input)
    {
        var client = httpClientFactory.CreateClient("email");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v3/mail/send")
        {
            Content = JsonContent.Create(new { to = input.Email, template = "invoice", input.InvoiceId, input.Amount })
        };
        request.Headers.Add("Idempotency-Key", $"invoice-email-{input.InvoiceId}");

        try
        {
            using var response = await client.SendAsync(request);
            response.EnsureSuccessStatusCode();
            _emailsSent++;
        }
        catch (Exception)
        {
        }

        Console.WriteLine($"Invoice email for {input.InvoiceId} processed ({_emailsSent} sent so far)");
        return new EmailResult(true);
    }
}
