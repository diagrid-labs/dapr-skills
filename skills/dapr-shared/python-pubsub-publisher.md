# Python pub/sub publisher

A FastAPI publisher that accepts an `<EventName>` and publishes it to the `<TopicName>` topic through the Dapr sidecar. Resolve every placeholder from the specification interview before copying this file; the vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md).

## Contracts

The file is `contracts/contracts/__init__.py` in a workspace, or `models.py` in a single service.

```python
from datetime import datetime

from pydantic import BaseModel, Field

PUBSUB_NAME = "pubsub"
<TOPIC_CONST> = "<TopicName>"
<DEAD_LETTER_TOPIC_CONST> = "<DeadLetterTopicName>"


class <EventName>(BaseModel):
    <event_fields>
```

`<event_fields>` comes from the interview: one annotated attribute per field the user described, with
`<id_field>` among them. Add the `Field` constraints the domain implies (`Field(min_length=1)` on the
identifier, `Field(gt=0)` on a quantity that must be positive) so invalid messages fail validation in the
handler instead of reaching the business logic. When the interview produced several events, add one model
per event and one `<TOPIC_CONST>`/`<DEAD_LETTER_TOPIC_CONST>` pair per topic.

## Publish endpoint

```python
import uvicorn
from dapr.clients import DaprClient
from dapr.clients.exceptions import DaprGrpcError
from fastapi import FastAPI, HTTPException

from contracts import <TOPIC_CONST>, PUBSUB_NAME, <EventName>

app = FastAPI()


@app.post("/<publish_route>", status_code=202)
def publish_<event_name>(<event_name>: <EventName>) -> dict:
    try:
        with DaprClient() as client:
            client.publish_event(
                pubsub_name=PUBSUB_NAME,
                topic_name=<TOPIC_CONST>,
                data=<event_name>.model_dump_json(),
                data_content_type="application/json",
            )
    except (DaprGrpcError, TimeoutError) as err:
        detail = err.details() if isinstance(err, DaprGrpcError) else err
        raise HTTPException(status_code=503, detail=f"Publishing the <EventDescription> failed: {detail}") from err
    return {"<id_field>": <event_name>.<id_field>}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

A single service uses `from models import ...`. In an add skill the route is `/pubsub/<publish_route>`.

`TimeoutError` is what the SDK raises when no sidecar is reachable: it waits for the sidecar health check and then times out; it does not raise `DaprGrpcError`. Set the `DAPR_HEALTH_TIMEOUT` environment variable (seconds) to shorten that wait.

## TTL and raw payload

Add message metadata with `publish_metadata`. Values are **strings**.

```python
client.publish_event(
    pubsub_name=PUBSUB_NAME,
    topic_name=<TOPIC_CONST>,
    data=<event_name>.model_dump_json(),
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
        topic_name=<TOPIC_CONST>,
        data=<event_name>.model_dump_json(),
        data_content_type="application/json",
    )
```

## Adding to an existing FastAPI app

Add the route to the module that creates `FastAPI()`, with the path `/pubsub/<publish_route>` so it does not collide with existing routes. Import `<EventName>` and the constants from `models.py` (or from `contracts`). Reuse an existing `DaprClient` if the app already has one.

When an existing endpoint also publishes, inject the publisher through a FastAPI dependency so tests can replace it with `app.dependency_overrides[get_<event_name>_publisher]`. Never call a module-level publish function directly from the endpoint, because `dependency_overrides` cannot replace that.

```python
from collections.abc import Callable

from fastapi import Depends


def publish_<event_name>(<event_name>: <EventName>) -> None:
    try:
        with DaprClient() as client:
            client.publish_event(
                pubsub_name=PUBSUB_NAME,
                topic_name=<TOPIC_CONST>,
                data=<event_name>.model_dump_json(),
                data_content_type="application/json",
            )
    except (DaprGrpcError, TimeoutError) as err:
        detail = err.details() if isinstance(err, DaprGrpcError) else err
        raise HTTPException(status_code=503, detail=f"Publishing the <EventDescription> failed: {detail}") from err


def get_<event_name>_publisher() -> Callable[[<EventName>], None]:
    return publish_<event_name>


# existing endpoint: add only the parameter and the call after its existing work
def <existing_endpoint>(..., publisher: Callable[[<EventName>], None] = Depends(get_<event_name>_publisher)):
    ...
    publisher(<EventName>(...))
```

In a test: `app.dependency_overrides[get_<event_name>_publisher] = lambda: (lambda <event_name>: None)`.

## Recipe: bulk publish

```python
with DaprClient() as client:
    resp = client.publish_events(
        pubsub_name=PUBSUB_NAME,
        topic_name=<TOPIC_CONST>,
        data=[e.model_dump_json() for e in <event_name>s],
        data_content_type="application/json",
    )
    if resp.failed_entries:
        raise HTTPException(status_code=502, detail=f"{len(resp.failed_entries)} messages were not published")
```

Check `resp.failed_entries`: a bulk publish can succeed partially.

## Key points

- `data` must be `str` or `bytes`. A `dict` raises `ValueError`; serialize with `model_dump_json()`.
- Set `data_content_type="application/json"`.
- Metadata values are strings. `{"ttlInSeconds": 60}` raises `TypeError`; use `"60"`.
- A sync `def` route runs in FastAPI's thread pool; do not call a sync `publish_event` inside `async def`.
- `DaprGrpcError` and `TimeoutError` map to 503.
- Never set `cloudevent.trace*` attributes; the sidecar propagates trace context.
