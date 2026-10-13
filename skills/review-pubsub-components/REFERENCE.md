# Reference: Review Dapr Pub/sub — Components and Configuration

This skill is read-only and operates entirely on existing YAML, `dapr.yaml` and the Aspire AppHost. The rule table lives in the shared checklist [`../dapr-shared/review-pubsub-components.md`](../dapr-shared/review-pubsub-components.md); target detection lives in [`../dapr-shared/review-detect-target-pubsub.md`](../dapr-shared/review-detect-target-pubsub.md).

## Worked example

Given this Aspire AppHost fragment:

```csharp
builder.AddProject<Projects.Billing_Subscriber>("billing-subscriber")
    .WithDaprSidecar(new DaprSidecarOptions
    {
        AppId = "billing-sub",
        ResourcesPaths = ["../components"]
    });
```

and these files in `components/` (line numbers below count from the first line of each file; the file name is a caption, not a line):

`components/pubsub.yaml`:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: pubsub
spec:
  type: pubsub.redis
  version: v1
  metadata:
    - name: redisHost
      value: redis.prod.internal:6379
    - name: redisPassword
      value: s3cret
    - name: enableTLS
      value: "true"
    - name: maxLenApprox
      value: "10000"
```

`components/subscription.yaml`:

```yaml
apiVersion: dapr.io/v2alpha1
kind: Subscription
metadata:
  name: orders
spec:
  pubsubname: pubsub
  topic: orders
  routes:
    default: /events/pubsub/orders
  deadLetterTopic: orders-deadletter
scopes:
  - billing-subscriber
```

with no `resiliency.yaml` in the folder, the expected report is:

```text
# Dapr review — review-pubsub-components

Target: components/, AppHost.cs
Language: aspire
Found: 2 critical, 1 warnings, 0 suggestions, 0 to verify

## Critical
- [DPS-CFG-001] `components/pubsub.yaml:12` — `redisPassword` holds an inline value for a non-local host
  Why: a credential committed to source control leaks with the repository.
  Fix: reference it with `secretKeyRef` and set `auth.secretStore`.
- [DPS-CFG-011] `components/subscription.yaml:12` — scope `billing-subscriber` matches no app id; AppHost sets `AppId = "billing-sub"`
  Why: the subscription loads for no app, so nothing is delivered.
  Fix: change the scope to `billing-sub` or set the same `AppId` in `AppHost.cs`.

## Warnings
- [DPS-CFG-003] `components/subscription.yaml:10` — `deadLetterTopic` set on `pubsub` and no Resiliency with an inbound retry
  Why: without a retry policy a failed message is dead-lettered immediately.
  Fix: add a `resiliency.yaml` with `targets.components.pubsub.inbound.retry`.

## Next steps
- Run `review-pubsub-subscriptions` to check the handlers behind these subscriptions.
- Re-run this skill after fixes, because critical findings were reported.
```

Key points:

- `DPS-CFG-001` is critical here because the host is not local and the value is not an Aspire secret-parameter default.
- `DPS-CFG-011` resolves `scopes` against the AppHost `AppId`, not the resource name, because `AppId` is set.
- `DPS-CFG-003` reads dead-letter topics from the `subscriptions` list, regardless of subscription type.

## Local-development baseline

The output of the `create-pubsub-*` skills is a local-development setup, so reviewing it yields only info findings:

- `DPS-CFG-007` — the `dapr init` Redis component has no `maxLenApprox` or `streamTTL`.
- `DPS-CFG-004` — `dapr.yaml` declares two apps (publisher and subscriber) and the component has no scopes.
- `DPS-CFG-001` — only for the Aspire `pubsub.yaml` password, which is info because it equals the default of an `AddParameter(..., secret: true)` local-development value.

The `dapr init` Redis has an empty password and a `localhost` host, so it yields no `DPS-CFG-001` and no `DPS-CFG-002`. A streaming-only subscriber has no `appPort`; that is correct and is not a `DPS-CFG-013` finding.

## Out of scope

- Publisher code (`PublishEventAsync`, `publish_event`) — covered by `review-pubsub-publishing`.
- Subscriber handlers and subscription-type choices in code — covered by `review-pubsub-subscriptions`.
- The `agent-pubsub` component — covered by `review-agent-orchestration`.
