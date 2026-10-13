## DAPR-PUBSUB.md template

```markdown
# Dapr pub/sub in <ProjectName>

## What was added
- `<path>` — <one line>

## Topics
| Pub/sub | Topic | Subscription type | Route or handler | Dead-letter topic |
|---|---|---|---|---|
| <pubsub> | <topic> | <declarative|programmatic|streaming> | <route or class> | <dead-letter topic or —> |

## Run it
<StartCommand> — <one line on what starts>.

## Try it
curl (macOS/Linux):
    curl -X POST http://localhost:<port><publish-route> -H "Content-Type: application/json" -d '<json>'
PowerShell:
    Invoke-RestMethod -Method Post -Uri http://localhost:<port><publish-route> -ContentType 'application/json' -Body '<json>'
Or use `<http-file>`.

## How the subscription works
<one paragraph for the type used: declarative = `<resources folder>/subscription.yaml`, hot-reloaded, scoped to `<app-id>`, ship it with the app (`kubectl apply -f subscription.yaml`); programmatic = advertised on `/dapr/subscribe`, read once at sidecar start (restart after changes); streaming = the app opens the stream, every message gets success/retry/drop>

## Delivery semantics
At-least-once delivery: the handler ignores duplicates by <dedupe key>. Invalid messages are answered with DROP: they are not redelivered, and they are forwarded to `<dead-letter topic>` when one is configured. Failures are retried <n> times (`resiliency.yaml`) and then go to `<dead-letter topic>`.

## Before production
- Set a Redis password through a secret store (`secretKeyRef`).
- Add `scopes` to the pub/sub component.
- Configure stream trimming (`maxLenApprox` or `streamTTL`).
- Replace the in-memory duplicate check with a state store.

<Diagrid Dapr Dev Dashboard section from ../dapr-shared/dev-dashboard.md README section; mention that its subscriptions view shows what each app registered>

## Run with Diagrid Catalyst
<dapr run mode only, from ../dapr-shared/running-with-catalyst.md>

## Next steps
- Review with `review-pubsub-publishing`, `review-pubsub-subscriptions` and `review-pubsub-components`.
```

## Filling it in

- `<StartCommand>` is `dapr run -f .` or `aspire run`.
- Add "Publish from `<endpoint>`" to Next steps when question 2 was answered no.
- Add "Mixed `Dapr.*` versions: <list>" under "Before production" when question 1 was answered no.
- Omit the Catalyst section in Aspire mode.
- When no dead-letter topic is configured, say that DROP is not redelivered and that the message is not forwarded anywhere. Never describe DROP as discarded silently when a dead-letter topic exists.

The run-doc section links use `../dapr-shared/` relative paths only inside the skill; in the generated `DAPR-PUBSUB.md` the content is copied, not linked.
