# Reference: add Dapr pub/sub to an existing Python FastAPI app

## Detection

| What | How |
|---|---|
| Scope | The folder the user named; otherwise the current directory, confirmed in one line. |
| FastAPI module | `Grep` `FastAPI(` in `**/*.py` (skip `.venv`, `venv`, `site-packages`, `tests`). One match → use it. Several → ask. None → the app is not FastAPI: stop (see Edge cases). |
| Other frameworks | `Flask(`, `django`, `from starlette` without FastAPI, `aiohttp.web` → not supported; stop and point to `## Alternative: dapr-ext-grpc` in [`../dapr-shared/python-pubsub-subscriber-programmatic.md`](../dapr-shared/python-pubsub-subscriber-programmatic.md). |
| Python version | `requires-python` in `pyproject.toml`, else `.python-version`, else `python --version` (try `python3`, then `py` on Windows). Below 3.10 → stop. |
| Package manager: uv | `uv.lock` or `[tool.uv]` / `[dependency-groups]` in `pyproject.toml`. Add with `uv add "dapr==<v>"`; check with `uv run`. |
| Package manager: pip + requirements | `requirements.txt` without `uv.lock`. Pin the lines with `Edit`, then `python -m pip install -r requirements.txt` using the project venv (`.venv/Scripts/python.exe` on Windows, `.venv/bin/python` elsewhere). No venv found → ask where it is. |
| Package manager: pip + pyproject | `pyproject.toml` with `[project].dependencies`, no `uv.lock`, no Poetry table. Pin there with `Edit`, then `python -m pip install -e .` in the venv. |
| Package manager: unsupported | `poetry.lock` or `[tool.poetry]` (Poetry), `pdm.lock` or `[tool.pdm]` (PDM), `Pipfile` (Pipenv), `environment.yml` (conda). Stop with an explanation; change nothing. |
| Existing Dapr packages | `dapr`, `dapr-ext-fastapi`, `dapr-ext-grpc`, `dapr-ext-workflow` in the dependency files, with pins. A `dapr==1.18.x` pin sets the version for `dapr-ext-fastapi` too. |
| Existing subscriptions | Programmatic: `DaprApp(` plus `.subscribe(`. Streaming: `subscribe_with_handler(` or `.subscribe(` on a `DaprClient`. Declarative: YAML with `kind: Subscription` whose `scopes` include this app id or that has no `scopes`. Record every `(pubsub, topic)` pair and its type. |
| Existing `DaprApp` / `lifespan` | `DaprApp(` and `lifespan=` / `@asynccontextmanager` in the app module. Reuse them; never duplicate. |
| Existing Dapr files | `dapr.yaml` and the folder in its `resourcesPath` (often `resources/` or `components/`); files with `type: pubsub.` (name, type, `scopes`); `kind: Resiliency` files. |
| App id and ports | `appID` and `appPort` in `dapr.yaml`; otherwise `uvicorn.run(... port=...)`; otherwise default 8000. App id fallback: the project name in kebab-case. |
| Trigger endpoints | `@app.post(`/`@router.post(` handlers that create or accept the domain thing. Remember whether a test calls it over HTTP (`TestClient`, `httpx`, `requests`). |
| Tests | `tests/`, `test_*.py`, `pytest` in the dependencies. |
| Git | `git status` only (read-only). |

## Add Pub/Sub Plan template

```markdown
## Add Pub/Sub Plan — <ProjectName>

**Target:** `<module path>` (Python <version>, <uv | pip + requirements.txt | pip + pyproject>)
**Role:** <publisher | subscriber | both>
**Subscription type:** <declarative | programmatic | streaming> — <default | follows existing `DaprApp` subscriptions | follows existing `resources/subscription.yaml` | follows existing `subscribe_with_handler` | requested>
**Topics:** <pubsub>/<topic> (<OrderPlaced | existing model>), dead-letter `<topic>-deadletter`

### Packages
- `dapr==<v>` → <pyproject.toml | requirements.txt> (publisher, programmatic, streaming)
- `dapr-ext-fastapi==<v>` → <file> (programmatic only)
- <dapr packages> <old version> → <v> (question 1)

### New files
- `<path>` — <purpose>

### Edited files
- `<path>` — <one-line edit description>

### Dapr wiring
- <dapr.yaml: new | append app entry | unchanged>; app id `<app-id>`, app port <port> (<kept | new>), Dapr HTTP <port>
- Component: <new `<resources folder>/pubsub.yaml` | reuse existing `<component name>` in `<path>`>
- Resiliency: <new `resiliency.yaml` | append target to existing `<path>`>
- Subscription: <new `<resources folder>/subscription.yaml` scoped to `<app-id>` | none: code subscription>

### Topics and routes
| Pub/sub | Topic | Type | Route or handler | Dead-letter |
|---|---|---|---|---|
| <pubsub> | <topic> | <type> | <`/events/<pubsub>/<topic>` | handler function> | <topic or —> |

### Left unchanged
- `README.md`, existing endpoints (except the trigger endpoint, question 2), existing components, tests

### Checks
- Baseline test run before changes: yes (reply "no baseline" to skip)
- Import check after every step: `<python> -m compileall -q <files>` and `<python> -c "import <module>"`
- <Uncommitted changes found: the edits will mix with them.>

### Risk
- <Only when question 2 is Yes and an existing test calls the trigger endpoint over HTTP: `<test file / test names>` call `<POST /orders>` and will need a Dapr sidecar or a test double for the publisher via `app.dependency_overrides[get_order_publisher]`; without a sidecar run them with `DAPR_HEALTH_TIMEOUT=2` (seconds) so they fail in seconds instead of waiting 60 s per call. This skill does not edit tests.>

### Questions
1. Newer packages are available: <dapr 1.18.0 → 1.18.3, dapr-ext-fastapi 1.18.0 → 1.18.3>. Update them? **Default: yes, update.**
2. Should `<POST /orders>` also publish `<OrderPlaced>` after it saves the <order>? **Default: yes.** <(Default no when the request does not ask to publish from this action and `<test name>` calls this endpoint over HTTP: it would need a running Dapr sidecar. When the request explicitly asks to publish from a named action or endpoint, the default stays yes and the Risk section above names the test.)>

<Leave out a question that does not apply. Without a trigger endpoint, write instead: No existing endpoint publishes; use the new publish endpoint.>

Reply **yes** to apply with the defaults, answer a question differently (for example "1: no"), list items to drop, or **stop**.
```

## Dependencies per subscription type

| Role and type | Packages | Notes |
|---|---|---|
| Publisher (any type) | `dapr` | `DaprClient.publish_event`. |
| Subscriber, declarative | none for subscribing | Plain FastAPI routes and `resources/subscription.yaml`. Add `dapr` only when the same app also publishes. |
| Subscriber, programmatic | `dapr-ext-fastapi` (and `dapr` when it also publishes) | `DaprApp(app).subscribe(...)`. |
| Subscriber, streaming | `dapr` | `DaprClient().subscribe_with_handler(...)`; no extra FastAPI package. |

Versions: `dapr` and `dapr-ext-fastapi` 1.18.3, or the existing `dapr==1.18.x` pin when the project has one (keep both packages on the same version). Never leave `dapr` and `dapr-ext-*` at different versions.

Commands per package manager:

- uv: `uv add "dapr==1.18.3"` (and `uv add "dapr-ext-fastapi==1.18.3"`).
- pip + requirements: `Edit` the lines in `requirements.txt`, then `<python> -m pip install -r requirements.txt`.
- pip + pyproject: `Edit` `[project].dependencies`, then `<python> -m pip install -e .`.

Do not add `fastapi`, `pydantic` or `uvicorn`: the app already has them. If `pydantic` is missing, ask before adding `pydantic==2.12.0`.

## Streaming add

Follow `## Inside an existing FastAPI app (add)` in [`../dapr-shared/python-pubsub-subscriber-streaming.md`](../dapr-shared/python-pubsub-subscriber-streaming.md): put `streaming.py` next to the app module and start the subscription in the `lifespan`.

- No `lifespan` yet: add the function from the shared file and pass `lifespan=lifespan` to `FastAPI(...)`.
- An existing `lifespan`: add the four subscription lines (create the client, start the subscription, close it, close the client) inside it. Keep every existing line and the existing `FastAPI(lifespan=...)` argument.
- Keep the app's `appPort`: the app still serves HTTP, and streaming ignores the port.

## Add Pub/Sub run doc

Use [`../dapr-shared/pubsub-run-doc.md`](../dapr-shared/pubsub-run-doc.md) with these values:

- `<StartCommand>`: `dapr run -f .` from the project root, or the one-app command `dapr run --app-id <app-id> --app-port <port> --resources-path ./resources -- uv run uvicorn <module>:app --port <port>` (drop `--app-port` for a streaming-only subscriber that serves no HTTP) when the project has no `dapr.yaml` and none was created.
- `<dedupe key>`: the CloudEvent `id`.
- The Catalyst section is included (this skill never uses Aspire).
- The `.http` file is the one appended to or created in step 6.

## Clashes and mixed types

| Situation | Behaviour |
|---|---|
| Existing pubsub component (any `pubsub.*`) | Reuse it and use its name as `PUBSUB_NAME`. Several → ask which. |
| A component named `pubsub` that is a `state.*` type | Name the new component `orders-pubsub` and say so in the plan. |
| Mixed subscription types already in the app | Allowed. Ask which type the new topic uses (default: the most used type). The plan lists the type per topic. |
| Same `(pubsub, topic)` already subscribed, any type | Never add a second subscription. Ask whether to extend the existing handler or use another topic. |
| Declarative YAML exists but its `scopes` do not include this app id | Do not reuse it. Add a new Subscription file scoped to this app and report the mismatch in the plan. |
| Existing `DaprApp` | Reuse it; add `.subscribe(...)` calls only. |
| Existing `lifespan` | Merge into it (streaming); never replace it. |
| Python programmatic or streaming combined with routing | `dapr-ext-fastapi` has no routing and streaming has no routes. Offer declarative for that subscription (default yes). |
| Existing `dapr.yaml` or resiliency file | Append to it; never replace it. |
| Role `both` in one app | Allowed. The plan notes that the app receives its own events. |
| App id or port already used in `dapr.yaml` | Use the next free value (ports in steps of 10) and state it in the plan. |

## Edge cases

- Python below 3.10, a non-FastAPI app, or Poetry, PDM, Pipenv or conda: stop with an explanation. No changes.
- Several FastAPI modules: ask which one.
- Declarative subscriber: `appPort` must exist in `dapr.yaml`; add it when missing and say so in the plan.
- Older `dapr*` packages and question 1 answered no: keep the new package at 1.18.3 and add a "Mixed `dapr*` versions" warning to `DAPR-PUBSUB.md`.
- Trigger endpoint covered by an HTTP test: when the request explicitly asks to publish from a named action or endpoint ("when an order is created/placed", "from POST /orders"), question 2 defaults to **yes** and the plan carries a **Risk** line naming the test file(s)/test(s), saying they will need a Dapr sidecar or a test double for the publisher (`app.dependency_overrides`) and that the skill does not edit tests. When the request does not mention publishing from an existing action, question 2 defaults to no. When declined, leave the endpoint unchanged and add "Publish from `<endpoint>`" to Next steps in `DAPR-PUBSUB.md`.
- No sidecar at publish time: `publish_event` raises `TimeoutError` after the health-check wait (not `DaprGrpcError`); the publisher template maps both to 503. `DAPR_HEALTH_TIMEOUT` shortens the wait. Do not "fix" this in the app's existing error handling.
- A `HotReload: false` Configuration: tell the run doc that declarative changes need a restart.
- No venv for pip projects: ask for the interpreter path; never create a venv on your own.
- Import check fails after a step: fix or undo that step, report it and stop.
- Tests fail at the end: report them; never edit tests. If the baseline passed and a test that calls the changed endpoint now fails because of the publish call (`publish_event` `TimeoutError`), report it as an expected consequence of the approved Risk line and name the one-line fix (`app.dependency_overrides[get_order_publisher] = ...`) and the quick-failure env var `DAPR_HEALTH_TIMEOUT=2`; unrelated failures are regressions. Failures that also failed in the baseline are reported as pre-existing.
- Long Windows paths (`path longer than allowed`, `os error 206`): report and suggest a shorter path or long-path support. Never use `subst`.
- Edits keep the existing line endings of each file.

## Worked example

For the `orders-fastapi-uv` layout (uv, `app/main.py` with `POST /orders` and `GET /orders/{order_id}`, `app/models.py` with `Order`, tests in `tests/test_orders.py` that use `TestClient`), role both, declarative:

- Plan: target `app/main.py` (Python 3.12, uv), role both, **Subscription type:** declarative — default, topic `pubsub/orders` with dead-letter `orders-deadletter`.
- Package: `uv add "dapr==1.18.3"` (needed for publishing; the declarative subscriber itself needs no Dapr package).
- New files: `app/handler.py` (from `python-pubsub-handler.md`), the contract and constants in `app/pubsub_models.py`, `resources/pubsub.yaml`, `resources/resiliency.yaml`, `resources/subscription.yaml` (`scopes: [orders-fastapi]`), `dapr.yaml`, `orders-fastapi.pubsub.http`, `DAPR-PUBSUB.md`. Adapt the template imports to the package: `from app.handler import handle_order_event, handle_dead_letter` in `app/main.py`, and `from app.pubsub_models import OrderPlaced` in `app/handler.py` (the templates import `handler` and `contracts`).
- Edited: `pyproject.toml` and `uv.lock` (by `uv add`), `app/main.py` — add `@app.post("/events/pubsub/orders")` and `@app.post("/events/pubsub/orders-deadletter")` plain routes taking `event: dict = Body(...)` (no `DaprApp`), and the publish endpoint `POST /pubsub/orders`.
- Question 2: the request says "publish an order-placed event when an order is created", so the default is **yes** even though `tests/test_orders.py` calls `POST /orders` over HTTP. `create_order` publishes after it saves, and the plan carries a **Risk** line: `tests/test_orders.py` will need a Dapr sidecar or a test double for the publisher (`app.dependency_overrides[get_order_publisher]`; `create_order` takes it as `Depends(get_order_publisher)`); the skill does not edit tests. (Had the request not mentioned publishing from an existing action, the default would be no.)
- `dapr.yaml`: appID `orders-fastapi`, appDirPath `.`, appPort 8000, daprHTTPPort 3500, command `["uv", "run", "uvicorn", "app.main:app", "--port", "8000"]`. The `scopes` entry in `subscription.yaml` equals the appID.
- Checks: after every step `uv run python -m compileall -q app` and, after steps 3–5, `uv run python -c "import app.main"`. Final: `uv run pytest`. The two tests that call `POST /orders` may now fail with a 503 because the publish call finds no sidecar; report that as an expected consequence of the approved Risk line, suggest the test double, run the final pytest with `DAPR_HEALTH_TIMEOUT=2` so it fails fast, and leave `tests/` untouched.
