# Pub/sub Publishing Checklist — Python

Apply each rule to every file in `publisher_files` from [`review-detect-target-pubsub.md`](review-detect-target-pubsub.md). `component_files` is context for DPS-PUB-003.

## Rule id map

| Rule id | .NET | Python |
| --- | --- | --- |
| DPS-PUB-001 | applies | applies |
| DPS-PUB-002 | applies | applies |
| DPS-PUB-003 | applies | applies |
| DPS-PUB-004 | reserved | applies |
| DPS-PUB-005 | applies | applies |
| DPS-PUB-006 | applies | applies |
| DPS-PUB-007 | applies | applies |
| DPS-PUB-008 | applies | applies |
| DPS-PUB-009 | applies | applies |
| DPS-PUB-010 | applies | applies |
| DPS-PUB-011 | reserved | applies |
| DPS-PUB-012 | applies | applies |

## Rules

| Rule id | Severity | What to detect | Why it matters | Suggested fix | Source |
| --- | --- | --- | --- | --- | --- |
| DPS-PUB-001 | critical | `publish_event(` on a `dapr.aio` client without `await` | The failure is never observed; the event may never be sent (a coroutine that is never awaited does not run) | `await` the call | `dapr/aio/clients/grpc/client.py` |
| DPS-PUB-002 | critical | An `except` around a publish that is empty, `pass`, or returns 2xx (a `return {...}` with no error status). An `except` that only logs and continues: **Please verify**. An `except DaprGrpcError` that does not also catch `TimeoutError`: **Please verify** | The caller believes the event was published; with no sidecar `publish_event` raises `TimeoutError`, not `DaprGrpcError` | `except (DaprGrpcError, TimeoutError)`, then re-raise or return 503 | `dapr/clients/exceptions.py` (`DaprGrpcError`) |
| DPS-PUB-003 | critical (Please verify when `component_files` is empty) | The pubsub name argument (literal, or the resolved constant value) differs from every `metadata.name` in `component_files` | Publish fails at runtime | Use the component name via a constant (`PUBSUB_NAME`) | `reference/api/pubsub_api.md`; `howto-publish-subscribe.md` |
| DPS-PUB-004 | critical | `data=` is a dict, list, model or `model_dump()` result instead of `str` / `bytes`; or a `publish_metadata` value is not a string literal or `str(...)` | `ValueError` / `TypeError` before publishing | `model_dump_json()` / `json.dumps()`; string metadata values | `dapr/clients/grpc/client.py` |
| DPS-PUB-005 | warning | `publish_event(` with `json.dumps` / `model_dump_json` data and no `data_content_type="application/json"`; an HTTP POST to `/v1.0/publish/` without a `Content-Type: application/json` header | Dapr assumes `text/plain` | Set the content type | `pubsub-overview.md`; `pubsub_api.md` |
| DPS-PUB-006 | warning | `DaprClient()` assigned to a variable outside `with` and never `.close()`d | Socket or channel exhaustion | `with DaprClient() as client` | Python `__exit__` |
| DPS-PUB-007 | warning | `publish_events(` whose result is not assigned, or whose `failed_entries` is never read | Partial failures are lost | Inspect the failed entries | `pubsub-bulk.md` |
| DPS-PUB-008 | warning | Metadata keys `cloudevent.traceparent`, `cloudevent.traceid`, `cloudevent.tracestate` | Breaks tracing | Remove them | `pubsub-cloudevents.md` |
| DPS-PUB-009 | info | The same pubsub or topic string literal at 2 or more publish/subscribe sites | Typos create other topics silently (names are case-sensitive) | Shared constants (`PUBSUB_NAME`, `ORDERS_TOPIC`) | `pubsub_api.md`; `pubsub-scopes.md` |
| DPS-PUB-010 | warning, reported under Please verify | The published data is a collection (`list[`, a query result) or file/stream bytes | Request body limit 4Mi (`--max-body-size`) | One event per item, or a reference | `reference/arguments-annotations-overview.md`; `pubsub-bulk.md` |
| DPS-PUB-011 | info | A sync `DaprClient().publish_event(` inside `async def` | Blocks the event loop | A `def` route, or `dapr.aio` with `await` | `dapr/aio/clients/grpc/client.py` |
| DPS-PUB-012 | info, reported under Please verify | Metadata `rawPayload` = `"true"` | Loses tracing, dedupe id and content type | Confirm the consumers are non-Dapr | `pubsub-raw.md` |

## Confidence notes

- DPS-PUB-002 — A handler that logs and continues, or that returns a non-2xx status on only some paths, is reported under Please verify. Verified behaviour: with no sidecar running, `publish_event` waits for the health check and raises `TimeoutError` (`DAPR_HEALTH_TIMEOUT` shortens the wait); `isinstance(e, DaprGrpcError)` is false for it, so an `except DaprGrpcError` alone does not turn a missing sidecar into a 503. Say so in `Fix:`.
- DPS-PUB-003 — When `component_files` is empty (the component lives outside the scope) report under Please verify, not Critical. Resolve constants before comparing.
- DPS-PUB-004 — `publish_metadata={"ttlInSeconds": "60"}` and `{"rawPayload": "true"}` are valid; an int value raises `TypeError`.
- DPS-PUB-010 — Always report under Please verify: the payload size cannot be proven statically.
- DPS-PUB-012 — Always report under Please verify; raw publishing is legitimate when the consumers are non-Dapr.

## Baseline

The publisher in [python-pubsub-publisher.md](python-pubsub-publisher.md) produces no finding.
