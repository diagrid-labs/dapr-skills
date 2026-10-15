# Pub/sub Publishing Checklist — .NET

Apply each rule to every file in `publisher_files` from [`review-detect-target-pubsub.md`](review-detect-target-pubsub.md). `component_files` is context for DPS-PUB-003.

## Rule id map

| Rule id | .NET | Python |
| --- | --- | --- |
| DPS-PUB-001 | applies | applies |
| DPS-PUB-002 | applies | applies |
| DPS-PUB-003 | applies | applies |
| DPS-PUB-004 | reserved | Python-only |
| DPS-PUB-005 | applies | applies |
| DPS-PUB-006 | applies | applies |
| DPS-PUB-007 | applies | applies |
| DPS-PUB-008 | applies | applies |
| DPS-PUB-009 | applies | applies |
| DPS-PUB-010 | applies | applies |
| DPS-PUB-011 | reserved | Python-only |
| DPS-PUB-012 | applies | applies |

## Rules

| Rule id | Severity | What to detect | Why it matters | Suggested fix | Source |
| --- | --- | --- | --- | --- | --- |
| DPS-PUB-001 | critical | A publish call whose `Task` is discarded: `_ = ...PublishEventAsync(`, a statement without `await` / `return`, or `.ContinueWith(` only | The failure is never observed; the event may never be sent | `await` the call | `src/Dapr.Client/DaprClient.cs` |
| DPS-PUB-002 | critical | A `catch` around a publish that is empty or returns 2xx (`Ok`, `Accepted`, `Created`, a result with no error status). A catch that only logs and continues: **Please verify** | The caller believes the event was published | Rethrow, or return 503 / `Problem` (catch `DaprException`) | `DaprClientGrpc.cs` (`DaprException`) |
| DPS-PUB-003 | critical (Please verify when `component_files` is empty) | The pubsub name argument (literal, or the resolved constant value) differs from every `metadata.name` in `component_files` | Publish fails at runtime | Use the component name via a constant | `reference/api/pubsub_api.md`; `howto-publish-subscribe.md` |
| DPS-PUB-005 | warning | An HTTP POST to `/v1.0/publish/` without a `Content-Type: application/json` header | Dapr assumes `text/plain` | Set the content type | `pubsub-overview.md`; `pubsub_api.md` |
| DPS-PUB-006 | warning | `new DaprClientBuilder()` + `.Build()` inside a method body that is not a DI factory or static initializer, or `using` / `Dispose()` on an injected `DaprClient` | Socket or channel exhaustion | DI singleton (`AddDaprClient()`) | `DaprClient.cs` doc comment; `dotnet-daprclient-usage.md` |
| DPS-PUB-007 | warning | `BulkPublishEventAsync(` whose result is not assigned, or whose `FailedEntries` is never read | Partial failures are lost | Inspect the failed entries | `pubsub-bulk.md`; `BulkPublishResponse.cs` |
| DPS-PUB-008 | warning | Metadata keys `cloudevent.traceparent`, `cloudevent.traceid`, `cloudevent.tracestate`; `PublishOptions { TraceParent =` / `TraceState =` | Breaks tracing | Remove them | `pubsub-cloudevents.md` |
| DPS-PUB-009 | info | The same pubsub or topic string literal at 2 or more publish/subscribe sites | Typos create other topics silently (names are case-sensitive) | Shared constants (`PubSubNames`) | `pubsub_api.md`; `pubsub-scopes.md` |
| DPS-PUB-010 | warning, reported under Please verify | The payload of a single-message `PublishEventAsync(` is a collection (`List<`, `IEnumerable<`, `.ToList()`, a query result) or file/stream bytes. **Never the collection passed to a bulk `BulkPublishEventAsync(`**, even when it is a LINQ projection: those entries are separate messages, so the Fix below is already satisfied | Request body limit 4Mi (`--max-body-size`) | One event per item, or a reference | `reference/arguments-annotations-overview.md`; `pubsub-bulk.md` |
| DPS-PUB-012 | info, reported under Please verify | Metadata `rawPayload` = `"true"` | Loses tracing, dedupe id and content type | Confirm the consumers are non-Dapr | `pubsub-raw.md` |

## Confidence notes

- DPS-PUB-002 — A catch that logs and continues, or that returns a non-2xx status on only some paths, is reported under Please verify. An empty catch or one that returns 2xx is critical.
- DPS-PUB-003 — When `component_files` is empty (the component lives outside the scope) report under Please verify, not Critical. Resolve constants (`PubSubNames.PubSubName`) before comparing.
- DPS-PUB-010 — Always report under Please verify: the payload size cannot be proven statically. Applies to `PublishEventAsync(` only. The collection passed to a bulk `BulkPublishEventAsync(` is a list of separate messages, not one oversized payload, so never report DPS-PUB-010 for it; a bulk call whose `FailedEntries` is unchecked is DPS-PUB-007.
- DPS-PUB-012 — Always report under Please verify; raw publishing is legitimate when the consumers are non-Dapr.

## Baseline

The publisher in [dotnet-pubsub-publisher.md](dotnet-pubsub-publisher.md) produces no finding.
