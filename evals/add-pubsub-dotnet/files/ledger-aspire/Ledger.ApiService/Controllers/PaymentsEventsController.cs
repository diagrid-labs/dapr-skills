using Dapr;
using Microsoft.AspNetCore.Mvc;

namespace Ledger.ApiService.Controllers;

[ApiController]
public sealed class PaymentsEventsController(ILogger<PaymentsEventsController> logger) : ControllerBase
{
    [Topic("pubsub", "payments")]
    [HttpPost("/events/pubsub/payments")]
    public IActionResult OnPayment([FromBody] PaymentReceived payment)
    {
        logger.LogInformation("Payment {PaymentId} of {Amount} received", payment.PaymentId, payment.Amount);
        return Ok();
    }
}

public sealed record PaymentReceived(string PaymentId, decimal Amount);
