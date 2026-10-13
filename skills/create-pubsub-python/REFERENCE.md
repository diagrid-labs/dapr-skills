# Create Dapr Pub/Sub Python Application — Reference

All code and YAML lives in [`../dapr-shared/`](../dapr-shared/SKILL.md); this file says which section to copy for each case and shows the resulting layouts.

## Folder structures

Role both, declarative subscriber:

```
<ProjectRoot>/
├── .gitignore
├── pyproject.toml              # uv workspace: members = ["contracts", "publisher", "subscriber"]
├── dapr.yaml
├── pubsub.http
├── README.md
├── resources/
│   ├── pubsub.yaml
│   ├── resiliency.yaml
│   └── subscription.yaml
├── contracts/
│   ├── pyproject.toml
│   └── contracts/__init__.py   # OrderPlaced, PUBSUB_NAME, ORDERS_TOPIC, ORDERS_DEAD_LETTER_TOPIC
├── publisher/
│   ├── pyproject.toml
│   └── main.py
└── subscriber/
    ├── pyproject.toml          # no Dapr dependency
    ├── main.py
    └── handler.py
```

Role both, programmatic subscriber: the same tree without `resources/subscription.yaml`. The subscriber `pyproject.toml` adds `dapr` and `dapr-ext-fastapi`, and `main.py` uses `DaprApp`.

Role both, streaming subscriber:

```
<ProjectRoot>/
├── .gitignore
├── pyproject.toml
├── dapr.yaml                   # subscriber entry has no appPort
├── pubsub.http                 # no @subscriberHost, no direct-CloudEvent request
├── README.md
├── resources/
│   ├── pubsub.yaml
│   └── resiliency.yaml         # no subscription.yaml
├── contracts/
├── publisher/
└── subscriber/
    ├── pyproject.toml          # dapr, pydantic; no FastAPI, no uvicorn
    ├── main.py                 # blocking loop, closes the subscription on exit
    └── streaming.py            # handlers and start_subscription
```

Single role (publisher or subscriber only): one service folder, no workspace and no `contracts/` package.

```
<ProjectRoot>/
├── .gitignore
├── dapr.yaml                   # one app entry
├── pubsub.http
├── README.md
├── resources/
│   ├── pubsub.yaml
│   ├── resiliency.yaml
│   └── subscription.yaml       # subscriber, declarative only
└── <service>/                  # publisher or subscriber
    ├── pyproject.toml          # single-service form
    ├── models.py               # OrderPlaced and constants; imports use `from models import ...`
    └── main.py                 # plus handler.py or streaming.py for a subscriber
```

Run `uv sync` in the service folder, or `uv sync` at the root for a workspace with `--all-packages`.

## Files per subscription type

Section names refer to the headings in the shared files.

| File | Declarative (default) | Programmatic | Streaming |
|---|---|---|---|
| `subscriber/main.py` | `python-pubsub-subscriber-declarative.md` → **main.py** | `python-pubsub-subscriber-programmatic.md` → **main.py** | `python-pubsub-subscriber-streaming.md` → **Standalone subscriber (create)**, `subscriber/main.py` |
| Handler | `python-pubsub-handler.md` → **handler.py** | `python-pubsub-handler.md` → **handler.py** | `subscriber/streaming.py` in the same section |
| `resources/subscription.yaml` | `dapr-pubsub-subscription.md` → **resources/subscription.yaml**, `scopes: [<root-kebab>-subscriber]` | not created | not created |
| Subscriber `pyproject.toml` | `python-pubsub-project.md`: FastAPI, pydantic, uvicorn | adds `dapr`, `dapr-ext-fastapi` | `dapr`, pydantic only |
| `dapr.yaml` subscriber entry | `appPort: 8002` | `appPort: 8002` | no `appPort` |
| Publisher `main.py` | `python-pubsub-publisher.md` → **Publish endpoint** | same | same |
| Contracts | `python-pubsub-publisher.md` → **Contracts** | same | same |
| Workspace and service `pyproject.toml` | `python-pubsub-project.md` | same | same |
| `resources/pubsub.yaml` | `dapr-pubsub-redis.md` | same | same |
| `resources/resiliency.yaml` | `dapr-pubsub-resiliency.md` → **resources/resiliency.yaml** | same | same |
| `pubsub.http` | `pubsub-local-http.md`, Python variant | adds the `/dapr/subscribe` request | drops `@subscriberHost` and the direct-CloudEvent request |
| `dapr.yaml` | `pubsub-dapr-yaml.md` → **Two apps**, Python block | same | same, minus `appPort` for the subscriber |

## Routing, TTL and raw payload

Add these only when the user asks for them. The dead-letter topic and the inbound retry policy are always present unless declined.

| Feature | Declarative | Programmatic | Streaming |
|---|---|---|---|
| Content-based routing | `dapr-pubsub-subscription.md` → **With routing rules**, plus one route per rule from `python-pubsub-subscriber-declarative.md` → **Routing rules** (`/events/pubsub/orders/<rule-name>`, for example `/events/pubsub/orders/large`) | Not supported by `dapr-ext-fastapi`. Ask: "dapr-ext-fastapi cannot route by content. Use a declarative subscription for this topic instead? (default: yes)" | Not supported. Ask: "Streaming subscriptions cannot route by content. Use a declarative subscription for this topic instead? (default: yes)" |
| Message TTL | Publisher side: `python-pubsub-publisher.md` → **TTL and raw payload** (`publish_metadata={"ttlInSeconds": "60"}`, a string) | same | same |
| Raw payload | Publisher `rawPayload` per `python-pubsub-publisher.md` → **TTL and raw payload**; subscriber: `dapr-pubsub-subscription.md` → **With raw payload** and `python-pubsub-subscriber-declarative.md` → **Raw payload** | `python-pubsub-subscriber-programmatic.md` → **Raw payload** | `python-pubsub-subscriber-streaming.md` → **Raw payload** |

Notes:

- The metadata key is always `rawPayload`.
- A raw subscription expects raw publishers. A Python streaming handler reads the bytes with `message.raw_data()`; declarative and programmatic handlers base64-decode `data_base64`.
- Routing is only scaffolded declaratively. When the user accepts the declarative switch, record the reason in the README.

## README key points

- Start with `dapr run -f .` from the project root. Ports: publisher 8001 (Dapr 3501), subscriber 8002 (Dapr 3502; streaming has no app port).
- Try it: `curl -X POST http://localhost:8001/orders -H "Content-Type: application/json" -d '{"order_id":"o-1","customer_id":"c-1","amount":1500,"placed_at":"2026-10-13T10:00:00Z"}'`, then look for `Order o-1 received` in the subscriber log. Link to `pubsub.http`. Python uses snake_case keys.
- List subscriptions with `GET http://localhost:3502/v1.0/metadata` and in the Dev Dashboard's subscriptions view.
- Declarative: the Subscription YAML hot-reloads. Programmatic subscriptions are read once at start-up. Streaming subscriptions live in code.
- Mermaid sequence diagram: publisher -> publisher sidecar -> Redis; then for declarative and programmatic, subscriber sidecar -> subscriber (HTTP POST); for streaming, subscriber -> subscriber sidecar (opens the gRPC stream) and the sidecar pushes messages over it.
- Local-only items (state them as such, not as defects): Redis without a password, no component `scopes`, no stream trimming.
- Delivery is at least once; the handler deduplicates on the CloudEvent `id`. The in-memory set is lost on restart, so use a Dapr state store before production.
- No sidecar running: the SDK raises `TimeoutError` after waiting for the sidecar, and the publisher answers 503. Set `DAPR_HEALTH_TIMEOUT` to shorten the wait.
- Include a short "Switching the message broker" paragraph: the app runs on Redis locally. Any broker works by replacing `resources/pubsub.yaml` with a component of that type from https://docs.dapr.io/reference/components-reference/supported-pubsub/ (for example a `pubsub.kafka` component) while keeping `metadata.name: pubsub`, so the code does not change. Link the supported-pubsub page for each broker's metadata and never put secrets inline: use `secretKeyRef`. When the user asked for another broker, add: "You asked for <broker>; this scaffold runs on Redis locally so it works without extra infrastructure."
- Never suggest running Redis separately.
- Finish with the Dev Dashboard section, the Catalyst section and the three review skills.

## Worked example

`order-flow`, role both, declarative subscriber.

Files:

```
order-flow/
├── .gitignore
├── pyproject.toml
├── dapr.yaml
├── pubsub.http
├── README.md
├── resources/pubsub.yaml
├── resources/resiliency.yaml
├── resources/subscription.yaml
├── contracts/pyproject.toml
├── contracts/contracts/__init__.py
├── publisher/pyproject.toml
├── publisher/main.py
├── subscriber/pyproject.toml
├── subscriber/main.py
└── subscriber/handler.py
```

`dapr.yaml`:

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
apps:
  - appID: order-flow-publisher
    appDirPath: publisher
    appPort: 8001
    daprHTTPPort: 3501
    command: ["uv", "run", "main.py"]
  - appID: order-flow-subscriber
    appDirPath: subscriber
    appPort: 8002
    daprHTTPPort: 3502
    command: ["uv", "run", "main.py"]
```

`resources/subscription.yaml` (the first document; the dead-letter document follows in the same file, see `dapr-pubsub-subscription.md`):

```yaml
apiVersion: dapr.io/v2alpha1
kind: Subscription
metadata:
  name: orders-subscription
spec:
  pubsubname: pubsub
  topic: orders
  routes:
    default: /events/pubsub/orders
  deadLetterTopic: orders-deadletter
scopes:
  - order-flow-subscriber
```

`scopes` equals the subscriber `appID`. Root `pyproject.toml` names the project `order-flow` with members `contracts`, `publisher` and `subscriber`; the services depend on `order-flow-contracts` through `[tool.uv.sources]`.

Verify: `uv sync --all-packages && uv run python -m compileall -q contracts publisher subscriber` exits with code 0. Remove the `__pycache__` folders afterwards.
