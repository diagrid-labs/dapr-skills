# Python declarative subscriber

A plain FastAPI app. The subscription is declared in `resources/subscription.yaml`; the app has no Dapr dependency. It uses `handler.py` from `python-pubsub-handler.md`. Resolve every placeholder from the specification interview before copying this file; the vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md).

## main.py

```python
import logging

import uvicorn
from fastapi import Body, FastAPI

from handler import handle_dead_letter, handle_<event_name>_event

logging.basicConfig(level=logging.INFO)
app = FastAPI()


@app.post("<subscribe_route>")
def <event_name>_events(event: dict = Body(...)) -> dict:
    return {"status": handle_<event_name>_event(event)}


@app.post("<dead_letter_route>")
def <event_name>_dead_letter(event: dict = Body(...)) -> dict:
    return {"status": handle_dead_letter(event)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
```

With several events, add one route and one handler import per event, and one `Subscription` block per topic.

## Routing rules

Only when the user asks for content-based routing. Add one route per rule that calls the same handler. `<RuleName>` is a short lowercase name for the case the rule selects and `<MatchExpression>` is the CEL expression over `event.data`, both taken from what the user described.

```python
@app.post("<subscribe_route>/<RuleName>")
def <event_name>_<RuleName>(event: dict = Body(...)) -> dict:
    return {"status": handle_<event_name>_event(event)}
```

and add a `rules` block to the `routes` section of the Subscription YAML. Rules are evaluated in order; `default` receives everything that matched no rule.

```yaml
routes:
  rules:
    - match: <MatchExpression>
      path: <subscribe_route>/<RuleName>
  default: <subscribe_route>
```

## Raw payload

Set `rawPayload` in the Subscription metadata:

```yaml
metadata:
  rawPayload: "true"
```

The handler then receives the envelope with `data_base64` (and no `data`); `parse_<event_name>` in `handler.py` decodes it. Publish with `publish_metadata={"rawPayload": "true"}` to match.

## Adding to an existing FastAPI app

Add the routes to the module that creates `FastAPI()` and put `handler.py` next to that module. Add `resources/subscription.yaml` and make sure its `scopes` entry equals the app id. Adapt `from handler import` and `from contracts import` to the app's package path.

## Key points

- No `DaprApp` and no Dapr dependency in this service.
- `resources/subscription.yaml` is the subscription.
- FastAPI parses `application/cloudevents+json` because it ends in `+json`.
- Every YAML route must exist here; a missing route answers 404 and Dapr drops the message.
- The subscriber needs `appPort` in `dapr.yaml` so the sidecar can deliver messages.
- Do not also subscribe to the same topic programmatically or by streaming.
