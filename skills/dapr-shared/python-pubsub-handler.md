# Python pub/sub handler

The shared message handler used by the declarative and programmatic subscribers. It takes the whole CloudEvent envelope as a `dict` and returns `"SUCCESS"` or `"DROP"`. Resolve every placeholder from the specification interview before copying this file; the vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md).

## handler.py

```python
import base64
import logging

from pydantic import ValidationError

from contracts import <EventName>

logger = logging.getLogger("subscriber")

# Event ids that were already processed. Replace with a Dapr state store before production:
# this set is lost on restart and not shared between replicas.
_processed_event_ids: set[str] = set()


def parse_<event_name>(event: dict) -> <EventName>:
    if "data_base64" in event:  # raw payload subscriptions
        return <EventName>.model_validate_json(base64.b64decode(event["data_base64"]))
    data = event.get("data")
    if isinstance(data, (str, bytes)):
        return <EventName>.model_validate_json(data)
    return <EventName>.model_validate(data)


def handle_<event_name>_event(event: dict) -> str:
    """Returns "SUCCESS" or "DROP". Raises on transient errors so Dapr retries."""
    try:
        <event_name> = parse_<event_name>(event)
    except (ValidationError, ValueError, TypeError) as err:
        logger.warning("Dropping invalid <EventDescription> event %s: %s", event.get("id"), err)
        return "DROP"

    event_id = event.get("id") or <event_name>.<id_field>
    if event_id in _processed_event_ids:
        logger.info("Event %s was already processed; acknowledging the duplicate", event_id)
        return "SUCCESS"

    <handler_body>
    _processed_event_ids.add(event_id)
    return "SUCCESS"


def handle_dead_letter(event: dict) -> str:
    logger.error("Dead-lettered <EventDescription> event %s: %s", event.get("id"), event.get("data"))
    return "SUCCESS"
```

A single service imports `from models import <EventName>`.

`<handler_body>` is what the user said the subscriber should do with the event. When they described no
action beyond receiving it, log it at information level with its identifying fields and nothing else —
never invent a side effect the user did not ask for. Work that can fail transiently belongs here and must
be allowed to raise; see the key points below.

Most domain validation belongs in the Pydantic model, not here: the `Field` constraints in
[python-pubsub-publisher.md](python-pubsub-publisher.md) make an invalid message raise `ValidationError`
in `parse_<event_name>`, which already returns `"DROP"`. Add an explicit `<validation_condition>` check
after parsing only for a rule the model cannot express.

With several events, add one `parse_*` and `handle_*_event` pair per event and share the single
`_processed_event_ids` set.

## Key points

- Accept the whole envelope; never put a domain Pydantic model in the route signature, because FastAPI would return 422 and Dapr would retry forever.
- Invalid input returns `"DROP"`. The route answers 200 with `{"status": "DROP"}`; Dapr does not redeliver the message and, when a dead-letter topic is configured, forwards it there.
- Duplicates return `"SUCCESS"` so the broker stops redelivering.
- Transient errors raise, FastAPI answers 500, and Dapr retries according to the resiliency policy.
- Never return 404: Dapr treats it as a drop and the message is lost without any retry.
- Raw payload subscriptions deliver the payload as `data_base64` (verified); `parse_<event_name>` decodes it, so the same handler works for raw and CloudEvent subscriptions.
- Replace `_processed_event_ids` with a Dapr state store before production.
