# Pub/sub Components Checklist (.NET, Aspire and Python)

Apply each rule to `component_files`, `subscription_files`, `resiliency_files` and `run_files` from `review-detect-target-pubsub.md`, with `subscriptions` as context. The checklist is language-neutral: every rule inspects YAML, `dapr.yaml` or the Aspire AppHost.

| Rule id | Severity | What to detect | Why it matters | Suggested fix | Source |
| ------- | -------- | -------------- | -------------- | ------------- | ------ |
| DPS-CFG-001 | critical; **info** when the host is `localhost`, `127.0.0.1` or `localhost:<port>`, or the value equals an Aspire `AddParameter(..., "<default>", secret: true)` default | Component metadata whose `name` contains (case-insensitive) `password`, `connectionstring`, `secret`, `token`, `sasl` or `key`, with a non-empty `value:` | A credential committed to source control | `secretKeyRef` + `auth.secretStore` | `operations/components/setup-pubsub/_index.md`; `operations/components/component-secrets.md`; `setup-redis-pubsub.md` |
| DPS-CFG-002 | warning | `type: pubsub.redis`, `redisPassword` value `""` or missing, and `redisHost` not localhost or 127.0.0.1 | An unauthenticated Redis beyond the dev machine | A password via `secretKeyRef` | `dapr-pubsub-redis.md`; `setup-redis-pubsub.md` |
| DPS-CFG-003 | warning | Any subscription (any type) with a dead-letter topic on component C, and no `kind: Resiliency` with `targets.components.C.inbound.retry` | Without a retry policy a failed message is dead-lettered immediately | Add `resiliency.yaml` | `pubsub-deadletter.md` |
| DPS-CFG-004 | info | `run_files` declare two or more apps, and the component has no `scopes:` and no `publishingScopes`, `subscriptionScopes`, `allowedTopics` or `protectedTopics` | Every app can publish and subscribe to every topic | Add scopes | `pubsub-scopes.md` |
| DPS-CFG-005 | warning | `consumerID` literal without `{appID}`, `{podName}` or `{namespace}` on a component used by two or more subscribing app ids | Apps sharing one consumer group split the messages between them instead of each receiving all (inferred from Redis consumer-group behaviour) | Remove it, or use `{appID}` | `setup-pubsub/_index.md`; `howto-namespace.md`; `pubsub-overview.md` (inference) |
| DPS-CFG-006 | info, reported under Please verify | `{namespace}` in any component metadata value | The component is scoped to the namespace, which may not be intended | Confirm the component-wide scoping | `howto-namespace.md` |
| DPS-CFG-007 | info | `pubsub.redis` without `maxLenApprox` or `streamTTL` | The Redis stream grows without bound | Set one | `setup-redis-pubsub.md` |
| DPS-CFG-008 | warning | `redeliverInterval: "0"` or `processingTimeout: "0"` | Unacknowledged messages are never redelivered | Use positive values | `setup-redis-pubsub.md` |
| DPS-CFG-009 | warning | `insecureSkipTLSVerify: "true"`, or (`enableTLS` absent or false and a non-local `redisHost`) | Traffic to Redis is unencrypted or unverified | Enable TLS | `setup-redis-pubsub.md` |
| DPS-CFG-010 | info | `kind: Subscription` with `apiVersion: dapr.io/v1alpha1` | The deprecated version has no `routes:` and no routing rules | v2alpha1 `routes:` | `reference/resource-specs/subscription-schema.md` |
| DPS-CFG-011 | critical | A Subscription whose `pubsubname` matches no component, or whose `scopes` contains no app id from `run_files` (`appID`, Aspire `AppId`, or the resource name when no AppId is set) | The subscription loads for no app, so nothing is delivered | Fix the name or the scope | `subscription-schema.md`; `subscription-methods.md` |
| DPS-CFG-012 | warning | A Resiliency retry policy targeted at a pubsub `inbound` with `maxRetries: -1` (or no `maxRetries` and no `maxInterval`), and no dead-letter topic on that component's subscriptions | A failing message is retried forever | Bound it and add a dead-letter topic | `operations/resiliency/policies/retries/retries-overview.md`; `operations/resiliency/targets.md` |
| DPS-CFG-013 | warning | Duplicate `appID`, `appPort`, `daprHTTPPort` or `daprGRPCPort` across `dapr.yaml` apps | A port or app-id collision stops one app or merges two | Use unique values | `dapr.yaml` (cf. `DAG-ORCH-007`) |
| DPS-CFG-014 | warning | `isRawPayload` as a key in a Subscription `spec.metadata`, or in programmatic subscription metadata | The runtime reads `rawPayload` only; the key is ignored and the subscriber gets a CloudEvent | Rename it to `rawPayload` | `components-contrib/metadata/utils.go` (`RawPayloadKey`); `pubsub-raw.md` (wrong example) |

## .NET / Aspire notes

- Read the component folder from `ResourcesPaths` in `AddDapr` / `WithReference` / `DaprSidecarOptions` in the AppHost, and the app ids from `DaprSidecarOptions.AppId`. When no `AppId` is set, the resource name is the app id (DPS-CFG-011, DPS-CFG-013).
- The parameter-default exemption for DPS-CFG-001: a metadata `value:` equal to the default of an Aspire `builder.AddParameter(..., "<default>", secret: true)` is info, not critical, because the default is a local-development value and real deployments override it.

## Python notes

- Read the component folder from `resourcesPath` (or `resourcesPaths`) in each app of `dapr.yaml`, and the app ids and ports from `appID`, `appPort`, `daprHTTPPort` and `daprGRPCPort`. A streaming-only subscriber has no `appPort`; that is correct and is not a DPS-CFG-013 finding.

## Confidence notes

- DPS-CFG-005 is an inference from the Redis consumer-group behaviour (the docs do not state it for `consumerID`); the rule stays a warning and the `Why:` line must say so.
- DPS-CFG-006 is Please verify: the finding only asks the user to confirm the namespace scoping.
- DPS-CFG-003 and DPS-CFG-012 read `subscriptions` for dead-letter topics of any type: YAML `deadLetterTopic`, `DeadLetterTopic`, `dead_letter_topic`.

## Baseline

The create-skill output yields only info findings: DPS-CFG-007, DPS-CFG-004 when there are two apps, and DPS-CFG-001 only for the Aspire `pubsub.yaml` password (the `dapr init` Redis has an empty password and yields no DPS-CFG-001).
