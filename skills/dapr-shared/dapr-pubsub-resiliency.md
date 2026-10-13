# resources/resiliency.yaml (inbound retry for pub/sub)

## resources/resiliency.yaml

```yaml
apiVersion: dapr.io/v1alpha1
kind: Resiliency
metadata:
  name: pubsub-resiliency
spec:
  policies:
    retries:
      pubsubRetry:
        policy: constant
        duration: 5s
        maxRetries: 5
  targets:
    components:
      pubsub:
        inbound:
          retry: pubsubRetry
```

## Appending to an existing Resiliency

- Add `pubsubRetry` under `spec.policies.retries`, and `pubsub: inbound: retry: pubsubRetry` under `spec.targets.components`, using `Edit`.
- If a target for the component already exists, leave it unchanged and say so in the plan.

## Key points

- `inbound` applies to sidecar-to-app delivery, so it governs what happens when the subscriber fails.
- The policy runs before dead-lettering: a message is dead-lettered only after the retries are exhausted. Verified: 1 initial delivery plus 5 retries is 6 deliveries, 5s apart, then the dead-letter handler receives the message (HTTP and Python streaming).
- Broker retries add to these.
- `maxRetries: -1` without a dead-letter topic loops forever.
- Without this file, a subscription that has a dead-letter topic dead-letters on the first failure.
- The target name (`pubsub`) must equal the component name.
- Streaming subscriptions: the policy applies to Python streaming (verified: `TopicEventResponse("retry")` is redelivered per the policy, then dead-lettered). In .NET streaming, a body that cannot be deserialized faults the stream and is redelivered by the reconnect loop, outside this policy's count.
