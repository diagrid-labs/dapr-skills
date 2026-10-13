using BillingService.Models;
using Dapr.Client;
using Microsoft.AspNetCore.Mvc;

namespace BillingService.Controllers;

[ApiController]
[Route("invoices")]
public sealed class InvoicesController(DaprClient dapr) : ControllerBase
{
    private const string StoreName = "billing-store";

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Invoice invoice)
    {
        await dapr.SaveStateAsync(StoreName, invoice.Id, invoice);
        return CreatedAtAction(nameof(Get), new { id = invoice.Id }, invoice);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var invoice = await dapr.GetStateAsync<Invoice?>(StoreName, id);
        return invoice is null ? NotFound() : Ok(invoice);
    }
}
