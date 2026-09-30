# Reference: Migrate an Existing TypeScript Application to Dapr

This reference has three parts: **discovery heuristics** (how to find migration candidates), the **infra-to-component mapping** (how to configure Dapr against what the app already runs on), and **verified before/after transformations** for each of the 7 categories. The `@dapr/dapr` API shapes here are the same ones verified against the real `@dapr/dapr@3.18.0` package in [`../create-workflow-typescript/REFERENCE.md`](../create-workflow-typescript/REFERENCE.md) — read that file's "SDK gotchas" section too; every gotcha there (async-generator workflows, the pub/sub retry behavior, HTTP-vs-gRPC asymmetry, no Jobs client wrapper) applies here unchanged.

## Discovery heuristics

Run these as `Grep`/`Glob` passes over `scope_root`, combined with a look at `package.json` dependencies. None of these are exact — every match becomes a report entry with a confidence-appropriate bucket (see [`../shared/migrate-report-format.md`](../shared/migrate-report-format.md)), not an automatic change.

### Cross-reference: name the client before matching the method

Several categories below key off a generic method name (`.get(`, `.set(`, `.send(`, `.publish(`) that also appears constantly in ordinary web-framework code with an unrelated meaning — most concretely, `.send(` matches Express's `res.send(...)` on every route handler in the codebase, and `.get(`/`.set(` matches `app.get('/orders', handler)` route *definitions* just as readily as a Redis client's `.get(key)`. A bare method-name grep across a whole file will drown every real finding in that noise.

Always resolve the method call to its **receiver's construction site** before reporting a candidate, in two passes:

1. `Grep` for the client constructors that matter for this category (e.g. `new Redis\(|createClient\(` for state, `\.producer\(\)|new Kafka\(|amqp\.connect\(|new SNSClient\(|new SQSClient\(` for pub/sub) and note the variable name(s) bound to the result.
2. `Grep` again for the method call **scoped to that variable name** (e.g. `\bredis\.(get|set|setex|del)\(` once you know the client is bound to `redis`), not the bare method name across the whole file.

A method-name match whose receiver you can't tie back to a known client constructor (a variable passed in as a function parameter, a property on `this` whose class you haven't inspected, etc.) goes to **Needs manual review**, never straight to Recommended.

### Service invocation

- **Dependency markers**: `axios`, `node-fetch`, `got`, `undici`, `@grpc/grpc-js`, or none (native `fetch`/`http`/`https`).
- **Grep patterns**: `axios\.(get|post|put|patch|delete)\(|axios\(`, `\bfetch\(`, `http\.request\(|https\.request\(`.
- **What makes it "service invocation" rather than a binding candidate**: the target host is a **first-party** service — matches a sibling folder/package in the same repo or monorepo, a docker-compose service name, a Kubernetes Service DNS name (`*.svc.cluster.local`), or an env var named `*_SERVICE_URL`/`*_SERVICE_HOST` that resolves to something the same team owns. A call to a domain the team does not own (stripe.com, twilio.com, an arbitrary public API) is a binding candidate instead, not this.
- **Confidence note**: a call built from a fully dynamic URL (e.g. `fetch(config.get('someUrl'))`) can't be classified from static analysis alone — file it under **Needs manual review**, not Recommended.

### Pub/sub

- **Dependency markers**: `kafkajs`, `amqplib`, `amqp-connection-manager`, `@aws-sdk/client-sns`, `@aws-sdk/client-sqs`, `@google-cloud/pubsub`, `nats`, `mqtt`.
- **Grep patterns** (apply the two-pass, name-the-client-first approach above — a bare `\.send\(` matches `res.send(...)` in every Express handler): find `\.producer\(\)|new Kafka\(|amqp\.connect\(|new SNSClient\(|new SQSClient\(` first, then scope `\.send\(|\.publish\(|\.produce\(` to that variable (producer side); find the consumer/channel variable, then scope `\.subscribe\(|\.consume\(|\.run\(\{` to it (consumer side); an `ioredis`/`redis` client (already named per the State section below) calling `.publish(`/`.subscribe(`/`.psubscribe(` instead of `.get(`/`.set(`.
- **`bullmq`/`bull` caution**: these are Redis-backed persistent queues — closer to a pub/sub-and-jobs hybrid than either building block cleanly. Default to **Needs manual review**: a `repeat:` option on the job points toward Jobs, continuous production/consumption without `repeat:` points toward pub/sub.

### Bindings

- **Output candidates**: the same outbound-call patterns as service invocation, but where the target is a **third-party** system — an SDK call to `@sendgrid/mail`, `twilio`, `@slack/web-api`, `nodemailer` (SMTP), an AWS SDK S3 client used for blob storage, or an `axios`/`fetch` call to a domain the team doesn't own.
- **Input candidates**: an existing HTTP route whose name or logic marks it as a webhook receiver (`/webhooks/*`, `/callback`, `/hooks/*`, verifying an `X-*-Signature` header), or a poller for an external system (SFTP, IMAP, a third-party REST API hit on an interval).
- **Overlap with Jobs**: a poller on a fixed interval is both a binding candidate (what it talks to) and a jobs candidate (how it's triggered) — report it under both rule ids with a note that only one design should be picked, not both.

### Jobs

- **Dependency markers**: `node-cron`, `node-schedule`, `agenda`, `bree`, `bull`/`bullmq` (specifically calls using a `repeat:` option).
- **Grep patterns**: `cron\.schedule\(|new CronJob\(|schedule\.scheduleJob\(`; `setInterval\(` is a candidate only when the interval is minutes-or-longer and does recognizable business work (report a very short interval used for retry/backoff as **Not recommended** — that's not what the Jobs building block is for).
- Also check `Dockerfile`/`docker-compose.yml`/any `k8s/*.yaml` for a `CronJob`-style entry that re-invokes this same codebase on a schedule from outside the process — that's a jobs candidate even with no in-process scheduler library.

### State management

- **Dependency markers (candidates)**: `ioredis`, `redis`, used with a TTL or a `session:`/`cache:`-style key prefix.
- **Dependency markers (usually NOT candidates)**: `node-cache`/`memory-cache`/`lru-cache` (in-process only — not a migration target at all, they don't cross a network boundary), `pg`, `mysql2`, `mongoose`, `prisma`, `typeorm`, `knex`, `sequelize`.
- **Grep patterns** (apply the two-pass, name-the-client-first approach above — a bare `\.get\(`/`\.set\(` matches Express route *definitions* like `app.get('/orders', handler)` far more often than a real Redis call): find `new Redis\(|createClient\(` (from `ioredis`/`redis`) first and note the variable name, then scope `\.(get|set|setex|del)\(` to that specific variable.
- **Relational/document access is "Not recommended" by default.** Even a query that looks like a pure single-row primary-key lookup is at most **Optional** — introducing a second persistence mechanism next to an existing ORM/query layer is a real ongoing cost, and Dapr state stores are not a transactional replacement for relational access with joins, aggregates, or multi-row transactions.

### Secrets

- **Grep patterns**: `process\.env\.[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)` (direct env access to a sensitive-looking name); `dotenv` import/`.config()` call.
- **Dependency markers that raise confidence to Recommended**: `@aws-sdk/client-secrets-manager`, `@google-cloud/secret-manager`, `node-vault`, `hashi-vault-js`, `@azure/keyvault-secrets` — a vendor-specific secrets SDK already in the tree is the clearest win, since Dapr's secret-store abstraction directly replaces it with zero vendor lock-in in the app code.
- A bare `process.env.*_KEY` read with **no** secrets-manager SDK anywhere in the tree is still worth reporting, but as **Optional** — the team may be fine with plain env vars for their deployment model.

### Workflow / saga

- **Structural pattern**: a function that calls two or more already-detected service-invocation/pub-sub/state candidates in sequence, wrapped in a `try`/`catch` that calls a differently-named "undo"/"compensate"/"rollback"/"release"-prefixed function on failure.
- **Dependency markers**: `xstate`, `javascript-state-machine`.
- **Cross-service pattern**: a queue consumer whose handler, on success, publishes to a *different* topic that's consumed by another handler in the same repo — a chain of hops implementing one logical business process across multiple independently-triggered functions.
- **Always at least "Needs manual review," never auto-"Recommended."** Restructuring control flow into a Dapr Workflow is the highest-risk, highest-judgment change this skill can propose — see the transformation section below for what it actually costs.

## Infra-to-component mapping

Propose the component that matches what Phase 3 found in the dependency tree and connection env vars — never default to a fresh Redis/Postgres the app doesn't already run against.

| Detected in the app | Building block | Component `type:` | Key metadata | Source |
| --- | --- | --- | --- | --- |
| `ioredis`/`redis`, simple cache/session use | State | `state.redis` | `redisHost`, `redisPassword` (see [`../shared/dapr-statestore.md`](../shared/dapr-statestore.md)) | already in this repo |
| `pg`/`prisma`/`knex` on Postgres, for the rare Optional-tier candidate | State | `state.postgresql` | `connectionString` (v1 and v2 share this type string — they differ only by `version:`, and v2's schema is **not** data-compatible with v1; pick one deliberately) | docs.dapr.io/reference/components-reference/supported-state-stores/setup-postgresql-v2/ |
| `mongoose`/`mongodb` | State | `state.mongodb` | `host` (or `server` for DNS SRV), `username`, `password`, `databaseName`, `collectionName` | docs.dapr.io/reference/components-reference/supported-state-stores/setup-mongodb/ |
| `@aws-sdk/client-dynamodb` | State | `state.aws.dynamodb` | `table`, `region`, `accessKey`, `secretKey` (omit access/secret key on EKS with an IAM role) | docs.dapr.io/reference/components-reference/supported-state-stores/setup-dynamodb/ |
| `ioredis`/`redis` used with pub/sub commands | Pub/sub | `pubsub.redis` | `redisHost`, `redisPassword` (see [`../shared/dapr-pubsub-redis.md`](../shared/dapr-pubsub-redis.md)) | already in this repo |
| `kafkajs` | Pub/sub | `pubsub.kafka` | `brokers`, `authType`, `consumerGroup`/`consumerID`, plus auth-specific fields | docs.dapr.io/reference/components-reference/supported-pubsub/setup-apache-kafka/ |
| `amqplib`/`amqp-connection-manager` | Pub/sub | `pubsub.rabbitmq` | `host` | already used in `@dapr/dapr`'s own examples |
| `@aws-sdk/client-sns` + `client-sqs` | Pub/sub | `pubsub.aws.snssqs` | `accessKey`, `secretKey`, `region` | docs.dapr.io/reference/components-reference/supported-pubsub/setup-aws-snssqs/ |
| `@google-cloud/pubsub` | Pub/sub | `pubsub.gcp.pubsub` | `projectId` (camelCase — see caution below) | docs.dapr.io/reference/components-reference/supported-pubsub/setup-gcp-pubsub/ |
| `dotenv` / bare `process.env.*_KEY` | Secrets | `secretstores.local.env` | none required (see [`../shared/dapr-secretstore-local-env.md`](../shared/dapr-secretstore-local-env.md)) | already in this repo |
| `@aws-sdk/client-secrets-manager` | Secrets | `secretstores.aws.secretmanager` | `region`, `accessKey`, `secretKey` (omit on EKS with an IAM role) | docs.dapr.io/reference/components-reference/supported-secret-stores/aws-secret-manager/ |
| `@google-cloud/secret-manager` | Secrets | `secretstores.gcp.secretmanager` | `project_id` (**snake_case** — see caution below) | docs.dapr.io/reference/components-reference/supported-secret-stores/gcp-secret-manager/ |
| `node-vault`/`hashi-vault-js` | Secrets | `secretstores.hashicorp.vault` | `vaultAddr`, one of `vaultToken`/`vaultTokenMountPath`, optional `enginePath` (default `secret`) | docs.dapr.io/reference/components-reference/supported-secret-stores/hashicorp-vault/ |
| `node-cron`/`node-schedule`/`agenda`/`bree`/`bull(mq)` repeatable jobs | Jobs | *(none — the Jobs API is built into Dapr's control-plane scheduler, not a pluggable component)* | — | confirmed in `create-workflow-typescript` |
| internal axios/fetch to a first-party service | Service invocation | *(none — addressed by `appId`, not a component)* | — | — |
| axios/fetch/SDK call to a third-party system | Bindings (output) | `bindings.http` is always a safe default; use a dedicated binding component if one exists for the target | `url` (see [`../create-workflow-typescript/REFERENCE.md`](../create-workflow-typescript/REFERENCE.md)) | already in this repo |
| Multi-step process with manual compensation, `xstate`, or queue-chained pipeline | Workflow | *(none directly — needs an actor-enabled state store, i.e. `actorStateStore: "true"` on whichever state component is chosen)* | — | — |

**Two easy copy-paste traps** worth checking for explicitly when writing these components:

- **PostgreSQL v1 vs v2** use the identical `type: state.postgresql` string — only `version:` distinguishes them, and their table schemas are not interchangeable. Confirm which one is intended rather than assuming.
- **GCP field naming is inconsistent between the two GCP components**: `pubsub.gcp.pubsub` metadata keys are camelCase (`projectId`, `privateKeyId`, …); `secretstores.gcp.secretmanager` metadata keys are snake_case (`project_id`, `private_key_id`, …), matching the raw GCP service-account JSON key names. Using the wrong case silently produces an unrecognized-field failure, not a helpful error.

None of the non-Redis backends above have a shared component file in this repo yet (only `state.redis`, `pubsub.redis`, `pubsub.rabbitmq`, `bindings.http`, `bindings.cron`, and `secretstores.local.env` do). Write the component inline in the migration using the metadata fields above, matching the YAML shape already used by [`../shared/dapr-statestore.md`](../shared/dapr-statestore.md).

## Verified before/after transformations

Apply these with `Edit` at the exact detected call site — never rewrite the whole file.

### 1. Secrets (do this category first)

```typescript
// BEFORE
const apiKey = process.env.STRIPE_API_KEY;

// AFTER
import { DaprClient } from "@dapr/dapr";
const daprClient = new DaprClient();
const secret = (await daprClient.secret.get("secretstore", "STRIPE_API_KEY")) as Record<string, string>;
const apiKey = secret["STRIPE_API_KEY"];
```

**Key points**: with `secretstores.local.env`, this reads the exact same environment variable — behavior in dev is identical before and after. The payoff comes later: swapping the component's `type:` to a real secret manager needs zero application code changes. This is the lowest-risk, easiest-to-verify category, which is why it's migrated first.

### 2. State (Redis-as-cache)

```typescript
// BEFORE
await redisClient.set(`session:${userId}`, JSON.stringify(session), "EX", 3600);
const raw = await redisClient.get(`session:${userId}`);
const restored = raw ? JSON.parse(raw) : null;

// AFTER
import { DaprClient } from "@dapr/dapr";
const daprClient = new DaprClient();
await daprClient.state.save("statestore", [
  { key: `session:${userId}`, value: session, metadata: { ttlInSeconds: "3600" } },
]);
const restored = await daprClient.state.get("statestore", `session:${userId}`);
```

**Key points**: `daprClient.state` JSON-serializes the value for you — drop the manual `JSON.stringify`/`JSON.parse`. The `"EX 3600"`-style TTL argument on `redisClient.set(...)` becomes a **per-item** `metadata: { ttlInSeconds: "3600" }` field (string value) on each element of the `save()` array — this is a real, SDK-verified field, not a guess, and Redis is one of the state stores that honors it; confirm TTL support for whichever backend you land on if it's not Redis. `state.get()` returns only the value, not an etag — use `state.getBulk()` if the existing code relies on optimistic concurrency.

### 3. Pub/sub

```typescript
// BEFORE (producer)
await kafkaProducer.send({
  topic: "order-events",
  messages: [{ value: JSON.stringify({ orderId, status: "completed" }) }],
});

// AFTER (producer)
import { DaprClient } from "@dapr/dapr";
const daprClient = new DaprClient();
await daprClient.pubsub.publish("pubsub", "order-events", { orderId, status: "completed" });
```

```typescript
// BEFORE (consumer)
await kafkaConsumer.run({
  eachMessage: async ({ message }) => {
    const event = JSON.parse(message.value!.toString());
    await handleOrderEvent(event);
  },
});

// AFTER (consumer — needs a DaprServer; reuse the app's existing Express instance via `serverHttp`)
import { DaprServer, DaprPubSubStatusEnum } from "@dapr/dapr";
const server = new DaprServer({ serverHttp: app });
await server.pubsub.subscribe("pubsub", "order-events", async (event: unknown) => {
  await handleOrderEvent(event);
  return DaprPubSubStatusEnum.SUCCESS;
});
await server.start();
```

**Key points**: Dapr's pub/sub abstraction doesn't expose partition keys or consumer groups the way a raw Kafka client does. If the existing code depends on ordered-by-key delivery, confirm the target component preserves that (`pubsub.kafka` does key-based partitioning; don't assume every backend does) before migrating, rather than discovering an ordering regression after the fact. Also: a handler that **throws** is caught and reported as success, not retried — return `DaprPubSubStatusEnum.RETRY`/`.DROP` explicitly if the existing code relies on the broker's native retry/redelivery.

### 4. Bindings (output — third-party webhook)

```typescript
// BEFORE
await axios.post("https://hooks.slack.com/services/T000/B000/XXXX", { text: message });

// AFTER
import { DaprClient } from "@dapr/dapr";
const daprClient = new DaprClient();
await daprClient.binding.send("slack-webhook", "post", { text: message });
```

**Key points**: the component's `url` metadata holds what used to be the hardcoded/env-var URL — nothing else about the payload shape changes.

### 5. Service invocation

```typescript
// BEFORE
const response = await axios.get(`${process.env.PRICING_SERVICE_URL}/price/${orderId}`);
const price = response.data;

// AFTER
import { DaprClient, HttpMethod } from "@dapr/dapr";
const daprClient = new DaprClient();
const price = await daprClient.invoker.invoke("pricing-service", `price/${orderId}`, HttpMethod.GET);
```

**Key points — the single biggest caveat in this whole skill**: `appId` ("pricing-service" here) replaces the base URL, but this only works once the **called** service is also running behind a Dapr sidecar registered under that `appID`. Migrating the caller without the callee gets nothing — call this out explicitly in the report rather than silently assuming the other side is ready. If the called service is in the same repo/monorepo, its own migration (adding `@dapr/dapr`, running it with a sidecar) is a prerequisite, not an afterthought.

### 6. Jobs

```typescript
// BEFORE
import cron from "node-cron";
cron.schedule("0 * * * *", async () => {
  await sendHourlyDigest();
});

// AFTER (no SDK wrapper exists — see create-workflow-typescript's SDK gotchas)
const daprHttpPort = process.env.DAPR_HTTP_PORT ?? "3500";
await fetch(`http://localhost:${daprHttpPort}/v1.0/jobs/hourly-digest`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data: {}, schedule: "0 * * * *", overwrite: true }),
});
```

and a callback route added to the app's existing HTTP server:

```typescript
app.post("/job/hourly-digest", async (req: Request, res: Response) => {
  await sendHourlyDigest();
  res.status(200).send();
});
```

**Key points**: schedule once at startup with `overwrite: true` so restarts don't fail trying to re-register an existing job name (or check `GET /v1.0/jobs/hourly-digest` first and skip scheduling if it already exists). Remove the `node-cron` dependency only after confirming the Dapr-triggered path fires correctly — don't delete the fallback in the same change that adds the new path.

### 7. Workflow / saga (do this category last, and only after the simpler ones are working)

```
BEFORE (conceptual — a 3-hop queue-chained pipeline):
  orders-queue consumer      → validates order  → publishes "orders.validated"
  orders.validated consumer  → reserves stock   → publishes "orders.reserved" (or "orders.failed" + a manual "release stock" message)
  orders.reserved consumer   → charges payment  → publishes "orders.completed" (or triggers compensation)
```

**AFTER**: one Dapr Workflow with one activity per former queue consumer — see [`../create-workflow-typescript/REFERENCE.md`](../create-workflow-typescript/REFERENCE.md) for the full authoring API, determinism rules, and the saga/compensation pattern in particular. The queue hops between steps become `yield ctx.callActivity(...)` calls in one workflow function; manual compensation-message publishing becomes a `try`/`catch` around the forward activities that calls the matching `undo*Activity`.

**Key points**: this trades three independently-deployable queue consumers for one workflow process — a real architectural change, not a client-library swap. Two things to check before proposing it as more than "needs manual review":
- Does compensating logic **already exist** today (an "orders.failed" handler that actually undoes prior steps), or are failures today just logged and left inconsistent? If the latter, migrating to Workflow is a chance to add real compensation — say that explicitly rather than implying the migration is behavior-preserving when it's actually a fix.
- Are the three steps deployed and scaled independently today for a real capacity reason? If so, collapsing them into one workflow process changes the scaling model — flag this as a design trade-off for the user to decide, not something to migrate silently.

## Migration ordering rationale

Categories are applied in this order (Phase 6 of `SKILL.md`) because each one is progressively harder to verify mechanically and more invasive to the app's runtime behavior:

1. **Secrets** — pure substitution, byte-identical behavior with `secretstores.local.env`, trivially verified by a typecheck.
2. **State** — same substitution shape, but serialization and TTL/etag semantics can differ subtly; verify with a real read-after-write.
3. **Pub/sub** — introduces a `DaprServer` on the consumer side for the first time; ordering/partitioning guarantees need explicit re-verification.
4. **Bindings** — mechanically simple, but check the payload shape the destination expects hasn't changed.
5. **Service invocation** — blocked on the *called* service being migrated too; sequence multi-service migrations accordingly.
6. **Jobs** — no SDK wrapper, so this is hand-written HTTP code; verify the callback route actually fires before removing the old scheduler.
7. **Workflow / saga** — highest risk, highest judgment; only attempt once 1–6 are stable and the team has read the determinism rules in `create-workflow-typescript/REFERENCE.md`.

## DAPR_MIGRATION.md template

```markdown
# Dapr Migration

## Migrated
### Secrets
- `src/payments/gateway.ts:12` — `process.env.STRIPE_API_KEY` → `daprClient.secret.get("secretstore", "STRIPE_API_KEY")` [MIG-SECRET-001]
<!-- one entry per applied item, grouped by building block -->

## Deferred (not recommended)
- [MIG-STATE-002] `src/reports/query.ts:88` — Postgres aggregate query; not a state-store fit, left as-is.

## Deferred (needs manual review)
- [MIG-WORKFLOW-001] `src/orders/*.ts` — 3-hop queue-chained pipeline; ask the `migrate-workflow-typescript` or `create-workflow-typescript` skill about the saga/compensation pattern before attempting.

## Components added
- `resources/secretstore.yaml` — `secretstores.local.env`

## Running locally
Start the Dapr sidecar and the app together with `dapr run -f .` from the project root (requires the [Dapr CLI](https://docs.dapr.io/getting-started/install-dapr-cli/) and Docker/Podman running).
```

**Important**: `DAPR_MIGRATION.md` is written into the *target* project's own repo, which does not have this plugin's `skills/` tree available on disk — never link back into `../shared/...` or `../create-workflow-typescript/...` from inside this template. Any cross-reference needs to be a self-contained instruction (as above) or a plain URL, not a relative path into this repo.

## Running Locally

See [`../shared/running-locally-dapr.md`](../shared/running-locally-dapr.md) for instructions.
