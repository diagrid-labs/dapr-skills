# Detect Review Target — Pub/sub

Used by every `review-pubsub-*` skill to locate the target language, the publishers, the subscriptions and the configuration files in scope before any rules are applied.

## Step 1: Detect language

Probe the project root (or the user-specified scope folder) for the markers below. Run these probes in parallel where possible.

| Marker file / pattern | Language target |
| --- | --- |
| `*.csproj` with `PackageReference Include="Dapr.AspNetCore"`, `"Dapr.Client"` or `"Dapr.Messaging"` | `dotnet` |
| The same, plus an AppHost project referencing `CommunityToolkit.Aspire.Hosting.Dapr` | `aspire` (treat as `dotnet` plus Aspire-specific notes) |
| `pyproject.toml` / `requirements*.txt` with `dapr`, an extra such as `dapr[fastapi]` or `dapr[grpc]` (1.19 and later), or the pre-1.19 `dapr-ext-fastapi` / `dapr-ext-grpc` packages | `python` |
| `pom.xml` that depends on `io.dapr.spring` (the `dapr-spring-boot-starter` or the `dapr-spring-bom`) or on `io.dapr:dapr-sdk`, in a scope with `.java` files, and that uses Spring Boot: the `io.dapr.spring` starter or BOM, a `spring-boot-starter-parent` parent, or an `org.springframework.boot` dependency (the `spring-boot-maven-plugin` alone does not count) | `java` |

Also: if a `kind: Subscription` YAML exists and the scope has `.py` files containing `FastAPI(`, the language is `python`.

If multiple targets exist (for example a .NET solution with a sibling Python app), confirm the scope with the user before continuing, or review once per language as described in `review-scope-prompt.md`.

Two Java builds are not supported:

- a `build.gradle` or `build.gradle.kts` that references `io.dapr` (Gradle);
- a `pom.xml` that depends on `io.dapr:dapr-sdk` without Spring Boot (plain Java).

If the only Java Dapr build in scope is one of these and no other marker above is present, stop the review without applying any rule and emit the "Nothing to review" report from [`review-report-format.md`](review-report-format.md) exactly as that template shows (the skill's heading, `Target:` the scope root, `Found: 0 critical, 0 warnings, 0 suggestions, 0 to verify`), with these fixed parts:

- `Language: java`
- `Nothing to review: ` followed by the stop sentence below and a full stop
- `## Next steps` with exactly one bullet: `- The Java review checklists cover Maven projects that use Spring Boot and the Dapr Spring Boot starter; create-workflow-java and create-pubsub-java show that layout.`

The stop sentence is, for Gradle: "Gradle projects are not supported by the Java review checklists; the checklists assume Maven and Spring Boot", and for plain Java: "Plain Java projects without Spring Boot are not supported by the Java review checklists; the checklists assume Maven and Spring Boot". If a marker above is also present (a Maven Spring Boot module or another language), treat the unsupported module as out of scope (leave its folder out of every file list), add its folder to `skipped` with the same stop sentence as the reason, name it in one `Next steps` bullet of the report (and in the scope prompt when one is asked), and continue with the supported target.

If no marker is found, stop the review and tell the user the target is not a recognized Dapr pub/sub project.

## Step 2: Build the lists

Globbing must be limited to the scope folder agreed in `review-scope-prompt.md`. For `java`, ignore everything under `target/` (Maven build output) and under `src/test/` (tests and their mocks).

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
  - Java: `@Topic\(` on a method in `**/*.java`. Read `name`, `pubsubName`, `deadLetterTopic`, `rule = @Rule(match = …)` and `metadata` (a JSON string such as `"{\"rawPayload\": \"true\"}"`); `route_or_handler` is the method's POST path (see `handler_files`), and `location` is the `@Topic(` line. A `@Topic` method that is also annotated `@BulkSubscribe` is a bulk subscription: do not add it to `subscriptions`; add it to `skipped` (with its `@Topic(` line) with the reason "bulk subscribe is not covered by the Java checklists", and name it in one `Next steps` bullet of the report, like other skipped items.
- **streaming** —
  - .NET: `\[DaprTopic\(` without `Delivery`, or with `DeliveryMode.Streaming`, and `SubscribeAsync\(`;
  - Python: `subscribe_with_handler\(`, `\.subscribe\(pubsub_name=`;
  - Java: `subscribeToTopic\(` and the deprecated `subscribeToEvents\(` in `**/*.java`. The `Flux` forms take `(pubsubName, topic, [deadLetterTopic,] TypeRef[, metadata])`; resolve each from the field or constructor parameter it comes from. `location` is the `subscribeToTopic(` / `subscribeToEvents(` line. A `subscribeToEvents(` call whose argument before the `TypeRef` is a `SubscriptionListener` (an anonymous `new SubscriptionListener<…>()`, a variable or field of that type, or a class implementing it) is the older listener form `(pubsubName, topic, [deadLetterTopic,] listener, TypeRef)`, which returns a `Subscription`, not a `Flux`: record it as streaming with `listener: true`, and add the file that declares the listener to `handler_files`.

**Java properties.** Read a Spring property from the app module's `src/main/resources/`: `application.properties`, `application.yml` and `application.yaml`, plus the profile files `application-<profile>.properties`, `application-<profile>.yml` and `application-<profile>.yaml` for each active profile. The active profiles come from `SPRING_PROFILES_ACTIVE` in the app's `env` in `dapr.yaml`, else from `spring.profiles.active` in the base files. Precedence follows Spring: a profile file wins over the base files, a later active profile wins over an earlier one, and in the same folder a `.properties` file wins over a `.yml` / `.yaml` file. `${key:default}` falls back to `default` when no file sets the key.

**Java placeholders.** `@Topic` values and `@Value("${…}")` arguments are usually `${…}` property placeholders. Resolve them from the Java properties above. The starter resolves `name`, `pubsubName`, `deadLetterTopic` and `rule = @Rule(match = …)` of `@Topic` (`sdk-springboot/src/main/java/io/dapr/springboot/DaprBeanPostProcessor.java:108-111`) but passes `metadata` to the sidecar as written, without resolving placeholders (`:116`): record a `${…}` inside `metadata` as literal text, not as its property value. A Maven module is one app; its `app_id` is the `dapr.yaml` `appID` whose `appDirPath` is the module folder. When a placeholder cannot be resolved, record the raw text (for example `${orders.topic}`) and report any finding that depends on its value under Please verify.

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
subscriptions: [ {type: declarative|programmatic|streaming, pubsub, topic, route_or_handler, dead_letter_topic, raw: bool, match, app_id, location: file:line, listener: bool (Java streaming only)} ]
handler_files: [ ... ]
component_files: [ ... ]
subscription_files: [ ... ]
resiliency_files: [ ... ]
run_files: [ ... ]
skipped: [ ... ]
scope_root: <absolute path>
```

Empty lists are valid. When the list the calling skill reviews is empty, the skill emits the "Nothing to review" report defined in [`review-report-format.md`](review-report-format.md) and stops; an empty list is not itself a rule finding.
