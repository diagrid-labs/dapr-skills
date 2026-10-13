# Python declarative subscriber

A plain FastAPI app. The subscription is declared in `resources/subscription.yaml`; the app has no Dapr dependency. It uses `handler.py` from `python-pubsub-handler.md`.

## main.py

```python
import logging

import uvicorn
from fastapi import Body, FastAPI

from handler import handle_dead_letter, handle_order_event

logging.basicConfig(level=logging.INFO)
app = FastAPI()


@app.post("/events/pubsub/orders")
def orders(event: dict = Body(...)) -> dict:
    return {"status": handle_order_event(event)}


@app.post("/events/pubsub/orders-deadletter")
def orders_dead_letter(event: dict = Body(...)) -> dict:
    return {"status": handle_dead_letter(event)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
```

## Routing rules

For content-based routing, add one route per rule that calls the same handler:

```python
@app.post("/events/pubsub/orders/large")
def orders_large(event: dict = Body(...)) -> dict:
    return {"status": handle_order_event(event)}
```

and add a `rules` block to the `routes` section of the Subscription YAML. Rules are evaluated in order; `default` receives everything that matched no rule.

```yaml
routes:
  rules:
    - match: int(event.data.amount) > 1000
      path: /events/pubsub/orders/large
  default: /events/pubsub/orders
```

## Raw payload

Set `rawPayload` in the Subscription metadata:

```yaml
metadata:
  rawPayload: "true"
```

The handler then receives the envelope with `data_base64` (and no `data`); `parse_order` in `handler.py` decodes it. Publish with `publish_metadata={"rawPayload": "true"}` to match.

## Adding to an existing FastAPI app

Add the routes to the module that creates `FastAPI()` and put `handler.py` next to that module. Add `resources/subscription.yaml` and make sure its `scopes` entry equals the app id. Adapt `from handler import` and `from contracts import` to the app's package path.

## Key points

- No `DaprApp` and no Dapr dependency in this service.
- `resources/subscription.yaml` is the subscription.
- FastAPI parses `application/cloudevents+json` because it ends in `+json`.
- Every YAML route must exist here; a missing route answers 404 and Dapr drops the message.
- The subscriber needs `appPort` in `dapr.yaml` so the sidecar can deliver messages.
- Do not also subscribe to the same topic programmatically or by streaming.
