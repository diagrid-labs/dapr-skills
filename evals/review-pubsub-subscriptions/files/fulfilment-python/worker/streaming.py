import logging
from typing import Callable

from dapr.clients import DaprClient
from dapr.clients.grpc._response import TopicEventResponse

from models import Invoice

logger = logging.getLogger("worker")


def handle_invoice(message) -> TopicEventResponse:
    try:
        invoice = Invoice.model_validate_json(message.raw_data())
    except ValueError as err:  # SEED DPS-SUB-013
        logger.warning("Ignoring invalid invoice %s: %s", message.id(), err)
        return
    logger.info("Invoice %s received: %s", invoice.invoice_id, invoice.amount)
    return TopicEventResponse("success")


def start_subscription(client: DaprClient) -> Callable[[], None]:
    client.subscribe_with_handler(pubsub_name="pubsub", topic="invoices", handler_fn=handle_invoice)  # SEED DPS-SUB-014 SEED DPS-SUB-016
    return lambda: None
