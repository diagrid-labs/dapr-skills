# Python pub/sub handler

The shared message handler used by the declarative and programmatic subscribers. It takes the whole CloudEvent envelope as a `dict` and returns `"SUCCESS"` or `"DROP"`.

## handler.py

```python
import base64
import logging

from pydantic import ValidationError

from contracts import OrderPlaced

logger = logging.getLogger("subscriber")

# Event ids that were already processed. Replace with a Dapr state store before production:
# this set is lost on restart and not shared between replicas.
_processed_event_ids: set[str] = set()


def parse_order(event: dict) -> OrderPlaced:
    if "data_base64" in event:  # raw payload subscriptions
        return OrderPlaced.model_validate_json(base64.b64decode(event["data_base64"]))
    data = event.get("data")
    if isinstance(data, (str, bytes)):
        return OrderPlaced.model_validate_json(data)
    return OrderPlaced.model_validate(data)


def handle_order_event(event: dict) -> str:
    """Returns "SUCCESS" or "DROP". Raises on transient errors so Dapr retries."""
    try:
        order = parse_order(event)
    except (ValidationError, ValueError, TypeError) as err:
        logger.warning("Dropping invalid order event %s: %s", event.get("id"), err)
        return "DROP"

    event_id = event.get("id") or order.order_id
    if event_id in _processed_event_ids:
        logger.info("Event %s was already processed; acknowledging the duplicate", event_id)
        return "SUCCESS"

    logger.info("Order %s received: %s for customer %s", order.order_id, order.amount, order.customer_id)
    _processed_event_ids.add(event_id)
    return "SUCCESS"


def handle_dead_letter(event: dict) -> str:
    logger.error("Dead-lettered order event %s: %s", event.get("id"), event.get("data"))
    return "SUCCESS"
```

A single service imports `from models import OrderPlaced`.

## Key points

- Accept the whole envelope; never put a domain Pydantic model in the route signature, because FastAPI would return 422 and Dapr would retry forever.
- Invalid input returns `"DROP"`. The route answers 200 with `{"status": "DROP"}`; Dapr does not redeliver the message and, when a dead-letter topic is configured, forwards it there.
- Duplicates return `"SUCCESS"` so the broker stops redelivering.
- Transient errors raise, FastAPI answers 500, and Dapr retries according to the resiliency policy.
- Never return 404: Dapr treats it as a drop and the message is lost without any retry.
- Raw payload subscriptions deliver the payload as `data_base64` (verified); `parse_order` decodes it, so the same handler works for raw and CloudEvent subscriptions.
- Replace `_processed_event_ids` with a Dapr state store before production.
