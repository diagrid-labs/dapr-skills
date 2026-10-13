using Dapr;
using Microsoft.AspNetCore.Mvc;

namespace ProgrammaticApp.Controllers;

[ApiController]
public sealed class OrderEventsController(OrderPlacedHandler handler, DeadLetterLogger deadLetters) : ControllerBase
{
    [Topic(PubSubNames.PubSubName, PubSubNames.OrdersTopic, PubSubNames.OrdersDeadLetterTopic, false)]
    [HttpPost("/events/pubsub/orders")]
    public Task<IResult> OrdersAsync(CancellationToken cancellationToken) =>
        handler.HandleAsync(Request, cancellationToken);

    [Topic(PubSubNames.PubSubName, PubSubNames.OrdersDeadLetterTopic)]
    [HttpPost("/events/pubsub/orders-deadletter")]
    public Task<IResult> OrdersDeadLetterAsync(CancellationToken cancellationToken) =>
        deadLetters.HandleAsync(Request, cancellationToken);
}
