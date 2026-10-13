# Detect Review Target — Pub/sub

Used by every `review-pubsub-*` skill to locate the target language, the publishers, the subscriptions and the configuration files in scope before any rules are applied.

## Step 1: Detect language

Probe the project root (or the user-specified scope folder) for the markers below. Run these probes in parallel where possible.

| Marker file / pattern | Language target |
| --- | --- |
| `*.csproj` with `PackageReference Include="Dapr.AspNetCore"`, `"Dapr.Client"` or `"Dapr.Messaging"` | `dotnet` |
| The same, plus an AppHost project referencing `CommunityToolkit.Aspire.Hosting.Dapr` | `aspire` (treat as `dotnet` plus Aspire-specific notes) |
| `pyproject.toml` / `requirements*.txt` with `dapr`, `dapr-ext-fastapi` or `dapr-ext-grpc` | `python` |

Also: if a `kind: Subscription` YAML exists and the scope has `.py` files containing `FastAPI(`, the language is `python`.

If multiple targets exist (for example a .NET solution with a sibling Python app), confirm the scope with the user before continuing, or review once per language as described in `review-scope-prompt.md`.

If no marker is found, stop the review and tell the user the target is not a recognized Dapr pub/sub project.

## Step 2: Build the lists

Globbing must be limited to the scope folder agreed in `review-scope-prompt.md`.

### `publisher_files`

- .NET: files matching `PublishEventAsync\(|PublishByteEventAsync\(|BulkPublishEventAsync\(|IDaprPublishSubscribeClient` in `**/*.cs`.
- Python: files matching `publish_event\(|publish_events\(` in `**/*.py`.
- Both: files containing `/v1.0/publish/` (raw HTTP publishing).

### `subscriptions`

Build one entry per pubsub+topic subscription. Every entry records `type`, `pubsub`, `topic`, `route_or_handler`, `dead_letter_topic`, `raw`, `match`, `app_id` and `location` (`file:line`).

- **declarative** — every YAML with `kind: Subscription`:
  - read `spec.pubsubname`, `spec.topic`, `spec.routes.default`, `spec.routes.rules[].path`, `spec.deadLetterTopic`, `spec.metadata.rawPayload` and `scopes`;
  - resolve `scopes` to app ids in `dapr.yaml` (`appID`) or in the AppHost (`AppId = "..."`, else the `AddProject` resource name);
  - a missing `scopes` means every app.
- **programmatic** —
  - .NET: `\[Topic\(`, `\.WithTopic\(`, and `\[DaprTopic\(` whose `Delivery = DeliveryMode.(Http|Programmatic)`;
  - Python: `@\w+\.subscribe\(` where the object was created by `DaprApp(`, and the gRPC `App().subscribe`.
- **streaming** —
  - .NET: `\[DaprTopic\(` without `Delivery`, or with `DeliveryMode.Streaming`, and `SubscribeAsync\(`;
  - Python: `subscribe_with_handler\(`, `\.subscribe\(pubsub_name=`.

### `handler_files`

For each declarative or programmatic route, the file that contains `MapPost\("<route>"`, `\[HttpPost\("<route>"` or `@app\.post\("<route>"`; plus the files of the streaming handlers.

### Configuration files

- `component_files` — YAML with `type: pubsub.`. Components with `metadata.name: agent-pubsub` go into `skipped` with the reason "covered by review-agent-orchestration".
- `subscription_files` — YAML with `kind: Subscription`.
- `resiliency_files` — YAML with `kind: Resiliency`.
- `run_files` — `dapr.yaml`, `**/AppHost.cs` and the AppHost `Program.cs`.

## Step 3: Record the target

Pass the following structured result back to the calling skill:

```
language: dotnet | aspire | python
publisher_files: [ ... ]
subscriptions: [ {type: declarative|programmatic|streaming, pubsub, topic, route_or_handler, dead_letter_topic, raw: bool, match, app_id, location: file:line} ]
handler_files: [ ... ]
component_files: [ ... ]
subscription_files: [ ... ]
resiliency_files: [ ... ]
run_files: [ ... ]
skipped: [ ... ]
scope_root: <absolute path>
```

Empty lists are valid. When the list the calling skill reviews is empty, the skill emits the "Nothing to review" report defined in [`review-report-format.md`](review-report-format.md) and stops; an empty list is not itself a rule finding.
