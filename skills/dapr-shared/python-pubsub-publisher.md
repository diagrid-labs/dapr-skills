# Python pub/sub publisher

A FastAPI publisher that accepts an `OrderPlaced` and publishes it to the `orders` topic through the Dapr sidecar.

## Contracts

The file is `contracts/contracts/__init__.py` in a workspace, or `models.py` in a single service.

```python
from datetime import datetime

from pydantic import BaseModel, Field

PUBSUB_NAME = "pubsub"
ORDERS_TOPIC = "orders"
ORDERS_DEAD_LETTER_TOPIC = "orders-deadletter"


class OrderPlaced(BaseModel):
    order_id: str = Field(min_length=1)
    customer_id: str
    amount: float = Field(gt=0)
    placed_at: datetime
```

## Publish endpoint

```python
import uvicorn
from dapr.clients import DaprClient
from dapr.clients.exceptions import DaprGrpcError
from fastapi import FastAPI, HTTPException

from contracts import ORDERS_TOPIC, PUBSUB_NAME, OrderPlaced

app = FastAPI()


@app.post("/orders", status_code=202)
def place_order(order: OrderPlaced) -> dict:
    try:
        with DaprClient() as client:
            client.publish_event(
                pubsub_name=PUBSUB_NAME,
                topic_name=ORDERS_TOPIC,
                data=order.model_dump_json(),
                data_content_type="application/json",
            )
    except (DaprGrpcError, TimeoutError) as err:
        detail = err.details() if isinstance(err, DaprGrpcError) else err
        raise HTTPException(status_code=503, detail=f"Publishing the order failed: {detail}") from err
    return {"order_id": order.order_id}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

A single service uses `from models import ...`. In an add skill the route is `/pubsub/orders`.

`TimeoutError` is what the SDK raises when no sidecar is reachable: it waits for the sidecar health check and then times out; it does not raise `DaprGrpcError`. Set the `DAPR_HEALTH_TIMEOUT` environment variable (seconds) to shorten that wait.

## TTL and raw payload

Add message metadata with `publish_metadata`. Values are **strings**.

```python
client.publish_event(
    pubsub_name=PUBSUB_NAME,
    topic_name=ORDERS_TOPIC,
    data=order.model_dump_json(),
    data_content_type="application/json",
    publish_metadata={"ttlInSeconds": "60"},
)
```

For a raw payload (no CloudEvent envelope) use `publish_metadata={"ttlInSeconds": "60", "rawPayload": "true"}`. The subscriber must then also be configured for raw payloads.

## Async variant

Inside an `async def` route, use the async client:

```python
from dapr.aio.clients import DaprClient

async with DaprClient() as client:
    await client.publish_event(
        pubsub_name=PUBSUB_NAME,
        topic_name=ORDERS_TOPIC,
        data=order.model_dump_json(),
        data_content_type="application/json",
    )
```

## Adding to an existing FastAPI app

Add the route to the module that creates `FastAPI()`, with the path `/pubsub/orders` so it does not collide with existing routes. Import `OrderPlaced` and the constants from `models.py` (or from `contracts`). Reuse an existing `DaprClient` if the app already has one.

When an existing endpoint (for example `POST /orders`) also publishes, inject the publisher through a FastAPI dependency so tests can replace it with `app.dependency_overrides[get_order_publisher]`. Never call a module-level publish function directly from the endpoint, because `dependency_overrides` cannot replace that.

```python
from collections.abc import Callable

from fastapi import Depends


def publish_order_placed(order: OrderPlaced) -> None:
    try:
        with DaprClient() as client:
            client.publish_event(
                pubsub_name=PUBSUB_NAME,
                topic_name=ORDERS_TOPIC,
                data=order.model_dump_json(),
                data_content_type="application/json",
            )
    except (DaprGrpcError, TimeoutError) as err:
        detail = err.details() if isinstance(err, DaprGrpcError) else err
        raise HTTPException(status_code=503, detail=f"Publishing the order failed: {detail}") from err


def get_order_publisher() -> Callable[[OrderPlaced], None]:
    return publish_order_placed


# existing endpoint: add only the parameter and the call after its existing work
def create_order(..., publisher: Callable[[OrderPlaced], None] = Depends(get_order_publisher)):
    ...
    publisher(OrderPlaced(...))
```

In a test: `app.dependency_overrides[get_order_publisher] = lambda: (lambda order: None)`.

## Recipe: bulk publish

```python
with DaprClient() as client:
    resp = client.publish_events(
        pubsub_name=PUBSUB_NAME,
        topic_name=ORDERS_TOPIC,
        data=[o.model_dump_json() for o in orders],
        data_content_type="application/json",
    )
    if resp.failed_entries:
        raise HTTPException(status_code=502, detail=f"{len(resp.failed_entries)} orders were not published")
```

Check `resp.failed_entries`: a bulk publish can succeed partially.

## Key points

- `data` must be `str` or `bytes`. A `dict` raises `ValueError`; serialize with `model_dump_json()`.
- Set `data_content_type="application/json"`.
- Metadata values are strings. `{"ttlInSeconds": 60}` raises `TypeError`; use `"60"`.
- A sync `def` route runs in FastAPI's thread pool; do not call a sync `publish_event` inside `async def`.
- `DaprGrpcError` and `TimeoutError` map to 503.
- Never set `cloudevent.trace*` attributes; the sidecar propagates trace context.
