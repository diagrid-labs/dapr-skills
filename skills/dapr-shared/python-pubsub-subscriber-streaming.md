# Python streaming subscriber

The app opens a gRPC stream to the sidecar and the sidecar pushes messages over it. No HTTP route, no `appPort`, no Subscription YAML.

## Standalone subscriber (create)

`subscriber/streaming.py`:

```python
import logging
from typing import Callable

from dapr.clients import DaprClient
from dapr.clients.grpc._response import TopicEventResponse
from pydantic import ValidationError

from contracts import ORDERS_DEAD_LETTER_TOPIC, ORDERS_TOPIC, PUBSUB_NAME, OrderPlaced

logger = logging.getLogger("subscriber")
_processed_event_ids: set[str] = set()  # replace with a state store before production


def handle_message(message) -> TopicEventResponse:
    try:
        order = OrderPlaced.model_validate_json(message.raw_data())
    except (ValidationError, ValueError) as err:
        logger.warning("Dropping invalid order event %s: %s", message.id(), err)
        return TopicEventResponse("drop")
    try:
        # replace with real processing
        if message.id() not in _processed_event_ids:
            logger.info("Order %s received via streaming: %s", order.order_id, order.amount)
            _processed_event_ids.add(message.id())
    except Exception:  # transient failure: ask Dapr to redeliver
        logger.exception("Processing order event %s failed; retrying", message.id())
        return TopicEventResponse("retry")
    return TopicEventResponse("success")


def handle_dead_letter(message) -> TopicEventResponse:
    logger.error("Dead-lettered order event %s: %s", message.id(), message.raw_data())
    return TopicEventResponse("success")


def start_subscription(client: DaprClient) -> Callable[[], None]:
    close_orders = client.subscribe_with_handler(
        pubsub_name=PUBSUB_NAME, topic=ORDERS_TOPIC, handler_fn=handle_message,
        dead_letter_topic=ORDERS_DEAD_LETTER_TOPIC)
    close_dead_letters = client.subscribe_with_handler(
        pubsub_name=PUBSUB_NAME, topic=ORDERS_DEAD_LETTER_TOPIC, handler_fn=handle_dead_letter)

    def close() -> None:
        close_orders()
        close_dead_letters()

    return close
```

`subscriber/main.py`:

```python
import logging
import signal
import threading

from dapr.clients import DaprClient

from streaming import start_subscription

logging.basicConfig(level=logging.INFO)
stop = threading.Event()


def _stop(*_: object) -> None:
    stop.set()


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    with DaprClient() as client:
        close = start_subscription(client)
        try:
            while not stop.wait(1):
                pass
        except KeyboardInterrupt:
            pass
        finally:
            close()
```

## Inside an existing FastAPI app (add)

Start the subscription from the app's lifespan:

```python
from contextlib import asynccontextmanager

from dapr.clients import DaprClient
from fastapi import FastAPI

from streaming import start_subscription


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = DaprClient()
    close = start_subscription(client)
    try:
        yield
    finally:
        close()
        client.close()

app = FastAPI(lifespan=lifespan)
```

The sync `DaprClient` is called inside the async lifespan; this is harmless because the stream runs on a background thread.

When the app already has a `lifespan`, the skill adds the four subscription lines (create the client, start the subscription, close, close the client) inside it instead of replacing it.

## Raw payload

Pass `metadata={"rawPayload": "true"}` to `subscribe_with_handler(...)`; `message.raw_data()` then returns the original published bytes (verified). A raw subscription expects raw publishers (`publish_metadata={"rawPayload": "true"}`). If a publisher sends a normal CloudEvent to a raw streaming subscription, `raw_data()` returns the full CloudEvent JSON envelope (`{"data": {...}, "id": ..., "pubsubname": ...}`) and `OrderPlaced` validation fails. For a non-raw subscription, `raw_data()` returns only the `data` payload.

## Async variant

```python
from dapr.aio.clients import DaprClient

close = await client.subscribe_with_handler(
    pubsub_name=PUBSUB_NAME, topic=ORDERS_TOPIC, handler_fn=handle_message,
    dead_letter_topic=ORDERS_DEAD_LETTER_TOPIC)
...
await close()
```

## Key points

- No routes, no `match`, no bulk.
- No `appPort` in a create skill.
- Every path returns a `TopicEventResponse`.
- Always call the close function.
- Valid statuses are `success`, `retry` and `drop`; anything else raises `KeyError`.
- `drop` is not redelivered, but when a dead-letter topic is configured the message is still forwarded to it (verified). Never describe `drop` as silently discarded.
- `retry` redelivers per the resiliency policy: with 5 retries that is 1 initial + 5 retries = 6 deliveries, after which the message goes to the dead-letter topic.
- The handler runs on a background thread.
