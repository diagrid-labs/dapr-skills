# Detect Review Target — Pub/sub

Used by every `review-pubsub-*` skill to locate the target language, the publishers, the subscriptions and the configuration files in scope before any rules are applied.

## Step 1: Detect language

Probe the project root (or the user-specified scope folder) for the markers below. Run these probes in parallel where possible.

| Marker file / pattern | Language target |
| --- | --- |
| `*.csproj` with `PackageReference Include="Dapr.AspNetCore"`, `"Dapr.Client"` or `"Dapr.Messaging"` | `dotnet` |
| The same, plus an AppHost project referencing `CommunityToolkit.Aspire.Hosting.Dapr` | `aspire` (treat as `dotnet` plus Aspire-specific notes) |
| `pyproject.toml` / `requirements*.txt` with `dapr`, an extra such as `dapr[fastapi]` or `dapr[grpc]` (1.19 and later), or the pre-1.19 `dapr-ext-fastapi` / `dapr-ext-grpc` packages | `python` |
| `pom.xml` that depends on `io.dapr.spring` (the `dapr-spring-boot-starter` or the `dapr-spring-bom`) or on `io.dapr:dapr-sdk`, in a scope with `.java` files | `java` |

Also: if a `kind: Subscription` YAML exists and the scope has `.py` files containing `FastAPI(`, the language is `python`.

If multiple targets exist (for example a .NET solution with a sibling Python app), confirm the scope with the user before continuing, or review once per language as described in `review-scope-prompt.md`.

If a `build.gradle` or `build.gradle.kts` references `io.dapr`, stop the review and tell the user: "Gradle projects are not supported by the Java review checklists; the checklists assume Maven and Spring Boot".

If no marker is found, stop the review and tell the user the target is not a recognized Dapr pub/sub project.

## Step 2: Build the lists

Globbing must be limited to the scope folder agreed in `review-scope-prompt.md`. For `java`, ignore everything under `target/` (Maven build output).

### `publisher_files`

- .NET: files matching `PublishEventAsync\(|PublishByteEventAsync\(|BulkPublishEventAsync\(|IDaprPublishSubscribeClient` in `**/*.cs`.
- Python: files matching `publish_event\(|publish_events\(` in `**/*.py`.
- Java: files matching `\.publishEvent\(|\.publishEvents\(|DaprMessagingTemplate|/v1\.0/publish/` in `**/*.java`.
- .NET and Python: files containing `/v1.0/publish/` (raw HTTP publishing).

### `subscriptions`

Build one entry per pubsub+topic subscription. Every entry records `type`, `pubsub`, `topic`, `route_or_handler`, `dead_letter_topic`, `raw`, `match`, `app_id` and `location` (`file:line`).

- **declarative** — every YAML with `kind: Subscription`:
  - read `spec.pubsubname`, `spec.topic`, `spec.routes.default`, `spec.routes.rules[].path`, `spec.deadLetterTopic`, `spec.metadata.rawPayload` and `scopes`;
  - resolve `scopes` to app ids in `dapr.yaml` (`appID`) or in the AppHost (`AppId = "..."`, else the `AddProject` resource name);
  - a missing `scopes` means every app.
- **programmatic** —
  - .NET: `\[Topic\(`, `\.WithTopic\(`, and `\[DaprTopic\(` whose `Delivery = DeliveryMode.(Http|Programmatic)`;
  - Python: `@\w+\.subscribe\(` where the object was created by `DaprApp(`, and the gRPC `App().subscribe`;
  - Java: `@Topic\(` on a method in `**/*.java`. Read `name`, `pubsubName`, `deadLetterTopic`, `rule = @Rule(match = …)` and `metadata` (a JSON string such as `"{\"rawPayload\": \"true\"}"`); `route_or_handler` is the method's POST path (see `handler_files`), and `location` is the `@Topic(` line.
- **streaming** —
  - .NET: `\[DaprTopic\(` without `Delivery`, or with `DeliveryMode.Streaming`, and `SubscribeAsync\(`;
  - Python: `subscribe_with_handler\(`, `\.subscribe\(pubsub_name=`;
  - Java: `subscribeToTopic\(` and the deprecated `subscribeToEvents\(` in `**/*.java`. The arguments are `(pubsubName, topic, [deadLetterTopic,] TypeRef[, metadata])`; resolve each from the field or constructor parameter it comes from. `location` is the `subscribeToTopic(` / `subscribeToEvents(` line.

**Java placeholders.** `@Topic` values and `@Value("${…}")` arguments are usually `${…}` property placeholders. Resolve them from the app's `src/main/resources/application.properties`, or from `application.yml` when that file exists (`${key:default}` falls back to `default` when the key is missing). A Maven module is one app; its `app_id` is the `dapr.yaml` `appID` whose `appDirPath` is the module folder. When a placeholder cannot be resolved, record the raw text (for example `${orders.topic}`) and report any finding that depends on its value under Please verify.

### `handler_files`

For each declarative or programmatic route, the file that contains `MapPost\("<route>"`, `\[HttpPost\("<route>"` or `@app\.post\("<route>"`, or, for Java, `@PostMapping("<route>")` (also `@PostMapping(value = …)` / `path = …`) or `@RequestMapping` with `method = RequestMethod.POST`. A class-level `@RequestMapping("<prefix>")` is joined to the method path: `@RequestMapping("/events/pubsub")` plus `@PostMapping("/orders")` is the route `/events/pubsub/orders`. Add the files of the streaming handlers: for Java, the class that calls `subscribeToTopic(` and the classes its consumer calls.

### Configuration files

- `component_files` — YAML with `type: pubsub.`. Components with `metadata.name: agent-pubsub` go into `skipped` with the reason "covered by review-agent-orchestration".
- `subscription_files` — YAML with `kind: Subscription`.
- `resiliency_files` — YAML with `kind: Resiliency`.
- `run_files` — `dapr.yaml`, `**/AppHost.cs` and the AppHost `Program.cs`. Java apps have no AppHost.

## Step 3: Record the target

Pass the following structured result back to the calling skill:

```
language: dotnet | aspire | python | java
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
