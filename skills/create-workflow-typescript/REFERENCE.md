# Reference: Dapr Workflow TypeScript Application

This reference uses the default **Order Processing** scenario. If the user asked for a different scenario, keep the same structure — one activity per building block, plus a companion service invoked over service invocation — but rename files, activities, topics, and components to fit their domain.

Every code sample below was compiled with `npx tsc --noEmit` against the real, published `@dapr/dapr@3.18.0` package before being written here. The `@dapr/dapr` SDK's own inline code comments are not always reliable (see "SDK gotchas" near the end) — the shapes used here are the verified ones, not the documented-but-nonexistent ones.

## dapr.yaml

Create a `dapr.yaml` multi-app run file in the project root. It starts the main app and the `pricing-service` companion together, each with its own Dapr sidecar.

```yaml
version: 1
common:
  resourcesPath: ./resources
  appLogDestination: fileAndConsole
  daprdLogDestination: fileAndConsole
apps:
  - appID: <app-id>
    appDirPath: <ProjectName>
    appPort: <app-port>
    daprHTTPPort: 3555
    env:
      PAYMENT_API_KEY: "sk-test-demo-51199"
    command: ["npm", "start"]
  - appID: pricing-service
    appDirPath: pricing-service
    appPort: 3001
    daprHTTPPort: 3565
    command: ["npm", "start"]
```

### Key points

- `resourcesPath` is shared by both apps' sidecars — `pricing-service` doesn't need most of the components, but loading them all is harmless.
- `env.PAYMENT_API_KEY` supplies a demo value for the secrets building block via the `secretstores.local.env` component (see `resources/secretstore.yaml`). Replace it with a real value, or a `secretKeyRef` to a production-grade secret store, before deploying anywhere beyond a local machine.
- `daprHTTPPort` values are chosen away from the Dapr CLI's own default (3500) to avoid colliding with a separately-running default sidecar. `daprGRPCPort` is left unset so the CLI assigns a free port automatically; the SDK reads it back via the `DAPR_GRPC_PORT` environment variable it injects into each app's process (see `WorkflowRuntime`/`DaprWorkflowClient` below — neither is passed an explicit port).
- Use `dapr run -f .` to start both apps and both sidecars with one command.

## resources/statestore.yaml

See [`../shared/dapr-statestore.md`](../shared/dapr-statestore.md) for the full example and key points.

## resources/pubsub.yaml

See [`../shared/dapr-pubsub-redis.md`](../shared/dapr-pubsub-redis.md) for the full example and key points.

## resources/secretstore.yaml

See [`../shared/dapr-secretstore-local-env.md`](../shared/dapr-secretstore-local-env.md) for the full example and key points.

## resources/binding-receipt.yaml

The output binding side of Bindings — delivers the order receipt.

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: receipt-binding
spec:
  type: bindings.http
  version: v1
  metadata:
  - name: url
    value: "http://localhost:<app-port>/notifications/log"
```

### Key points

- `url` points at this same app's own `/notifications/log` route so the demo needs no external service. Repoint it at a real email/SMS/webhook provider in production.
- Invoked from `activities.ts` via `client.binding.send("receipt-binding", "post", data)`.

## resources/binding-schedule.yaml

The input binding side of Bindings — a cron trigger, needing no extra infrastructure.

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: schedule-binding
spec:
  type: bindings.cron
  version: v1
  metadata:
  - name: schedule
    value: "@every 30s"
  - name: direction
    value: "input"
```

### Key points

- Dapr invokes the app every 30 seconds; the handler is registered with `server.binding.receive("schedule-binding", ...)` in `src/index.ts`.
- In a real system this would drive something like "scan for stale orders" — the generated handler just logs, with a `// TODO: implement actual functionality` comment.

## package.json (main app)

```json
{
  "name": "<ProjectName>",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "ts-node src/index.ts"
  },
  "dependencies": {
    "@dapr/dapr": "3.18.0",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "ts-node": "^10.9.0",
    "@types/node": "^22.0.0",
    "@types/express": "^4.17.0"
  }
}
```

## tsconfig.json (both apps)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

### Key points

- `module: "commonjs"` matches `@dapr/dapr`'s own tested consumption pattern (its `test/e2e/typescript-build` package depends on the built SDK and compiles against it with `module: "commonjs"`) — don't switch this project to ESM without first confirming the SDK still resolves correctly.
- `npm start` runs the app directly with `ts-node` (no separate build step needed for local development); `npm run build` compiles to `dist/` with `tsc` for anything that needs a plain-JS artifact.
- `skipLibCheck: true` avoids type-checking the SDK's own `.d.ts` files, which is the SDK's own recommended setting.

## src/models.ts

```typescript
export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderInput {
  id: string;
  customerName: string;
  items: OrderItem[];
}

export interface OrderRecord {
  orderId: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  status: "processing" | "paid" | "completed";
}

export interface PricingResult {
  subtotal: number;
  tax: number;
  total: number;
}

export interface OrderSummary {
  orderId: string;
  total: number;
  status: string;
}
```

### Key points

- Plain TypeScript interfaces are enough — Dapr Workflow serializes activity/workflow input and output with `JSON.stringify`, so there is no model-binding library to opt into (unlike the Pydantic/record-type conventions in the Python/.NET skills).
- Keep types JSON-safe: primitives, plain objects, and arrays. Class instances, functions, `Date` objects (convert to ISO strings first), and `Map`/`Set` do not round-trip through workflow history.

## src/index.ts

The main entrypoint. Builds a plain Express app, hands it to `DaprServer` so Dapr-routed calls and the app's own routes share one HTTP port, and separately starts the `WorkflowRuntime` (which opens its own gRPC connection to the sidecar, independent of `DaprServer`'s protocol).

```typescript
import express, { Request, Response } from "express";
import { DaprServer, DaprWorkflowClient, WorkflowRuntime, DaprPubSubStatusEnum } from "@dapr/dapr";
import { orderProcessingWorkflow } from "./workflow";
import {
  calculatePricingActivity,
  saveOrderStateActivity,
  getPaymentApiKeyActivity,
  chargePaymentActivity,
  publishOrderCompletedActivity,
  sendReceiptActivity,
  scheduleFollowUpJobActivity,
} from "./activities";
import { OrderInput } from "./models";

const PUBSUB_NAME = "pubsub";
const ORDER_TOPIC = "order-completed";

async function start() {
  // A plain Express app carries our own routes (workflow management + the Dapr Jobs
  // callback) because @dapr/dapr's DaprServer does not wrap the Jobs building block.
  // Passing it in via `serverHttp` puts Dapr's own routes (invoker/pubsub/bindings) on
  // the SAME port instead of opening a second server.
  const app = express();
  app.use(express.json());

  const server = new DaprServer({ serverHttp: app });
  const workflowClient = new DaprWorkflowClient();
  const workflowRuntime = new WorkflowRuntime();

  workflowRuntime
    .registerWorkflow(orderProcessingWorkflow)
    .registerActivity(calculatePricingActivity)
    .registerActivity(saveOrderStateActivity)
    .registerActivity(getPaymentApiKeyActivity)
    .registerActivity(chargePaymentActivity)
    .registerActivity(publishOrderCompletedActivity)
    .registerActivity(sendReceiptActivity)
    .registerActivity(scheduleFollowUpJobActivity);

  // --- Workflow management endpoints ---
  app.post("/start", async (req: Request, res: Response) => {
    const input = req.body as OrderInput;
    const instanceId = await workflowClient.scheduleNewWorkflow(orderProcessingWorkflow, input, input.id);
    res.json({ instance_id: instanceId });
  });

  app.get("/status/:instanceId", async (req: Request, res: Response) => {
    const state = await workflowClient.getWorkflowState(req.params.instanceId, true);
    if (!state) {
      res.status(404).json({ error: "instance not found" });
      return;
    }
    res.json({
      instanceId: state.instanceId,
      name: state.name,
      runtimeStatus: state.runtimeStatus,
      createdAt: state.createdAt,
      lastUpdatedAt: state.lastUpdatedAt,
      serializedOutput: state.serializedOutput,
    });
  });

  app.post("/pause/:instanceId", async (req: Request, res: Response) => {
    await workflowClient.suspendWorkflow(req.params.instanceId);
    res.json({ status: "paused" });
  });

  app.post("/resume/:instanceId", async (req: Request, res: Response) => {
    await workflowClient.resumeWorkflow(req.params.instanceId);
    res.json({ status: "resumed" });
  });

  app.post("/terminate/:instanceId", async (req: Request, res: Response) => {
    await workflowClient.terminateWorkflow(req.params.instanceId, null);
    res.json({ status: "terminated" });
  });

  app.post("/purge/:instanceId", async (req: Request, res: Response) => {
    const purged = await workflowClient.purgeWorkflow(req.params.instanceId);
    res.json({ status: purged ? "purged" : "not_found" });
  });

  // --- Jobs building block: Dapr calls this back when a scheduled job fires ---
  // (Direct HTTP route, not the @dapr/dapr SDK — see activities.ts for why.)
  app.post("/job/:jobName", async (req: Request, res: Response) => {
    console.log(`Job triggered: ${req.params.jobName}`, req.body);
    res.status(200).send();
  });

  // --- Bindings building block (output side): a stand-in "notification" endpoint ---
  // the binding delivers to (see resources/binding-receipt.yaml).
  app.post("/notifications/log", (req: Request, res: Response) => {
    console.log("Receipt notification:", req.body);
    res.status(200).send();
  });

  // --- Pub/sub building block: subscribe to the topic this app also publishes to ---
  // (stands in for a separate "shipping" or "notifications" service in this single-app demo).
  // Must be registered before server.start().
  await server.pubsub.subscribe(PUBSUB_NAME, ORDER_TOPIC, async (data: unknown) => {
    console.log("Order completed event received:", data);
    return DaprPubSubStatusEnum.SUCCESS;
  });

  // --- Bindings building block (input side): a cron trigger fired BY Dapr on a
  // schedule, needing no external infrastructure. Also registered before server.start().
  await server.binding.receive("schedule-binding", async () => {
    // TODO: implement actual functionality — e.g. scan for stale orders.
    console.log("Cron input binding fired — checking for stale orders (demo)");
  });

  await server.start();
  await workflowRuntime.start();

  console.log("<ProjectName> is running");
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### Key points

- `new DaprServer({ serverHttp: app })` and `new DaprWorkflowClient()` / `new WorkflowRuntime()` are all constructed with no explicit host/port — they read `APP_PORT`, `DAPR_HTTP_PORT`, and `DAPR_GRPC_PORT` from the environment, which `dapr run -f .` injects automatically from `dapr.yaml`.
- `server.pubsub.subscribe(...)` and `server.binding.receive(...)` must be called **before** `server.start()`.
- Returning `DaprPubSubStatusEnum.SUCCESS`/`.RETRY`/`.DROP` from a subscription handler controls Dapr's ack/retry/dead-letter behavior. If a handler throws instead of returning a status, the SDK catches it, logs it, and still reports `SUCCESS` — it will **not** retry. Return `DaprPubSubStatusEnum.RETRY` explicitly for anything that should be retried.
- `workflowClient.terminateWorkflow(instanceId, output)` takes a second argument (an optional output value recorded against the terminated instance) — `null` is fine when there's nothing meaningful to record.
- `/purge` only makes sense once an instance has reached a terminal state (Completed/Failed/Terminated); purging a running instance drops its in-flight history.
- Import workflow and activity functions before calling `.start()` so the runtime has them registered — `registerWorkflow`/`registerActivity` must run before `workflowRuntime.start()`, not after.

## src/workflow.ts

A workflow is an `async function*` (not a plain `function*` — see "SDK gotchas" below) referenced directly by `WorkflowRuntime.registerWorkflow(...)`. It orchestrates activities with `yield ctx.callActivity(...)`.

```typescript
import { WorkflowContext, TWorkflow } from "@dapr/dapr";
import {
  calculatePricingActivity,
  saveOrderStateActivity,
  getPaymentApiKeyActivity,
  chargePaymentActivity,
  publishOrderCompletedActivity,
  sendReceiptActivity,
  scheduleFollowUpJobActivity,
} from "./activities";
import { OrderInput, OrderRecord, OrderSummary } from "./models";

export const orderProcessingWorkflow: TWorkflow = async function* (ctx: WorkflowContext, order: OrderInput): any {
  // 1. Service invocation — ask the pricing-service app for the order total.
  const pricing = yield ctx.callActivity(calculatePricingActivity, order.items);

  let record: OrderRecord = {
    orderId: order.id,
    customerName: order.customerName,
    items: order.items,
    total: pricing.total,
    status: "processing",
  };

  // 2. State management — persist the order.
  yield ctx.callActivity(saveOrderStateActivity, record);

  // 3. Secrets — read the (mock) payment gateway API key.
  const apiKey = yield ctx.callActivity(getPaymentApiKeyActivity);

  // 4. State management again — charge the order and update its status.
  record = yield ctx.callActivity(chargePaymentActivity, { order: record, apiKey });

  // 5. Pub/sub — announce completion.
  yield ctx.callActivity(publishOrderCompletedActivity, record);

  // 6. Bindings (output) — send the receipt.
  yield ctx.callActivity(sendReceiptActivity, record);

  // 7. Jobs — schedule a follow-up reminder.
  yield ctx.callActivity(scheduleFollowUpJobActivity, record);

  const summary: OrderSummary = { orderId: record.orderId, total: record.total, status: "completed" };
  return summary;
};
```

### Key points

- The `ctx: WorkflowContext` parameter provides the workflow context. The `: any` return annotation matches the SDK's own examples — `TWorkflow`'s declared return type doesn't line up cleanly with what a generator function needs to satisfy under `strict` mode (see "SDK gotchas"), and fighting that is not worth it.
- Reference activity functions directly (no string names needed) when calling `registerActivity`/`callActivity` — the SDK derives the registered name from `fn.name`, so activities must be **named** functions, not anonymous arrow functions assigned inline.
- Activities are chained by passing the output of one as the input to the next, same as every other Dapr Workflow SDK.
- Guard `console.log`/logging with `if (!ctx.isReplaying())` to avoid duplicate output during workflow replay.

### Workflow determinism

The workflow runtime replays the generator function's history on every new event, so the function body must produce the exact same sequence of yields given the same history. This SDK enforces it: replaying against changed or non-deterministic code throws a `NonDeterminismError`. Avoid the following inside a workflow function:

- `new Date()` / `Date.now()` — use `ctx.getCurrentUtcDateTime()` instead.
- `Math.random()` or ID generation — do it in an activity instead.
- Direct I/O (HTTP calls, file access, database queries, the `daprClient` calls used in `activities.ts`) — perform these in activities, never in the workflow body.
- `setTimeout`/sleeping — use `ctx.createTimer(...)` instead.
- Unbounded `while` loops — use `ctx.continueAsNew(...)` instead (see the Monitor pattern below).
- A plain (non-`async`) `function*` — the runtime dispatches based on `Symbol.asyncIterator`, which only `async function*` implements. A sync generator matching `TWorkflow`'s declared type will compile but will not execute correctly.

### Workflow patterns

The generated app uses task chaining end to end. The patterns below are additional shapes to reach for when adapting this scaffold — none of them ship in the generated code, so copy in only what you need.

#### Task chaining

```typescript
const taskChainWorkflow: TWorkflow = async function* (ctx: WorkflowContext, input: number): any {
  const result1 = yield ctx.callActivity(activity1, input);
  const result2 = yield ctx.callActivity(activity2, result1);
  const result3 = yield ctx.callActivity(activity3, result2);
  return [result1, result2, result3];
};
```

#### Fan-out/fan-in

Execute multiple activities in parallel and wait for all of them to complete with `ctx.whenAll(...)`:

```typescript
const batchProcessingWorkflow: TWorkflow = async function* (ctx: WorkflowContext, input: number): any {
  // get a batch of N work items to process in parallel
  const workBatch = yield ctx.callActivity(getWorkBatch, input);

  // schedule N parallel tasks to process the work items and wait for all to complete
  const parallelTasks = workBatch.map((workItem: unknown) => ctx.callActivity(processWorkItem, workItem));
  const outputs = yield ctx.whenAll(parallelTasks);

  // aggregate the results and send them to another activity
  const total = outputs.reduce((sum: number, value: number) => sum + value, 0);
  yield ctx.callActivity(processResults, total);
};
```

#### Child workflows

Call another workflow from within a workflow using `ctx.callChildWorkflow`:

```typescript
const parentWorkflow: TWorkflow = async function* (ctx: WorkflowContext): any {
  const childInstanceId = `${ctx.getWorkflowInstanceId()}-child`;
  if (!ctx.isReplaying()) {
    console.log(`*** Calling child workflow ${childInstanceId}`);
  }
  yield ctx.callChildWorkflow(childWorkflow, undefined, childInstanceId);
};

const childWorkflow: TWorkflow = async function* (ctx: WorkflowContext): any {
  if (!ctx.isReplaying()) {
    console.log(`*** Child workflow ${ctx.getWorkflowInstanceId()} called`);
  }
};
```

Both workflows must be registered with `registerWorkflow(...)` like any other.

#### Monitor pattern

```typescript
const monitorWorkflow: TWorkflow = async function* (ctx: WorkflowContext, input: unknown): any {
  const status = yield ctx.callActivity(checkStatus, input);
  if (!status) {
    yield ctx.createTimer(30); // seconds from now
    ctx.continueAsNew(input, true);
    return;
  }
  return status;
};
```

#### External system interaction (human-in-the-loop)

Pause the workflow until an external event arrives. This is useful for approval flows where a human or external system must respond before the workflow can continue.

```typescript
const approvalWorkflow: TWorkflow = async function* (
  ctx: WorkflowContext,
  order: { id: string; totalPrice: number },
): any {
  let isApproved = true;

  if (order.totalPrice > 250) {
    // Pauses here until workflowClient.raiseEvent(instanceId, "approval-event", payload) is called.
    const approval = yield ctx.waitForExternalEvent("approval-event");
    isApproved = approval?.isApproved ?? false;
  }

  if (isApproved) {
    yield ctx.callActivity(processOrderActivity, order);
  }

  const message = isApproved ? `Order ${order.id} has been approved.` : `Order ${order.id} has been rejected.`;
  yield ctx.callActivity(sendNotificationActivity, message);
  return message;
};
```

##### Key points

- `yield ctx.waitForExternalEvent(name)` pauses the workflow until `workflowClient.raiseEvent(instanceId, name, payload)` is called elsewhere; the yielded value is whatever `payload` was passed. Event names are matched case-insensitively.
- Unlike some other Dapr Workflow SDKs, `waitForExternalEvent` in `@dapr/dapr@3.18.0` takes **no built-in timeout parameter**. To bound the wait, race it against `ctx.createTimer(...)` via `ctx.whenAny([...])` — check the winning task's shape against the `@dapr/dapr` type definitions installed in your project (`node_modules/@dapr/dapr/index.d.ts`) before relying on it; this SDK version documents that surface less thoroughly than the rest of the workflow API.
- Guard logging with `if (!ctx.isReplaying())`.

#### Saga / compensation

Chain forward steps with a compensating activity that undoes completed work when a later step fails. Return a typed result instead of rethrowing so the workflow instance completes cleanly.

```typescript
const orderSagaWorkflow: TWorkflow = async function* (ctx: WorkflowContext, orderInput: { orderId: string }): any {
  const reservation = yield ctx.callActivity(reserveItemActivity, orderInput);

  try {
    const payment = yield ctx.callActivity(payItemActivity, reservation);
    return {
      isSuccess: true,
      message: `Order ${orderInput.orderId} completed. Payment: ${payment.transactionId}.`,
    };
  } catch (err) {
    if (!ctx.isReplaying()) {
      console.log(`*** Payment failed for order ${orderInput.orderId}: ${err}`);
    }
    yield ctx.callActivity(undoReserveItemActivity, reservation);
    return {
      isSuccess: false,
      message: `Order ${orderInput.orderId} failed during payment and the reservation was released.`,
    };
  }
};
```

##### Key points

- Each forward step should have a dedicated compensating activity (`reserveItemActivity` ↔ `undoReserveItemActivity`).
- Do not rethrow after compensation — return a typed result (e.g. an `isSuccess` flag) so the workflow instance completes cleanly and callers can react to the outcome.
- Compensation activities must be idempotent; the runtime may replay them.

## local.http

See [`../shared/typescript-local-http.md`](../shared/typescript-local-http.md) for the full example and key points.

## src/activities.ts

Activities contain the actual business logic and are where I/O happens. Each one below demonstrates a single building block.

```typescript
import { DaprClient, HttpMethod, WorkflowActivityContext } from "@dapr/dapr";
import { OrderItem, OrderRecord, PricingResult } from "./models";

const daprClient = new DaprClient();

const STATE_STORE = "statestore";
const SECRET_STORE = "secretstore";
const PUBSUB_NAME = "pubsub";
const ORDER_TOPIC = "order-completed";
const BINDING_NAME = "receipt-binding";
const PRICING_APP_ID = "pricing-service";

export async function calculatePricingActivity(
  _ctx: WorkflowActivityContext,
  items: OrderItem[],
): Promise<PricingResult> {
  // Service invocation: call the pricing-service app to compute the order total.
  const result = await daprClient.invoker.invoke(PRICING_APP_ID, "calculate-total", HttpMethod.POST, { items });
  return result as unknown as PricingResult;
}

export async function saveOrderStateActivity(_ctx: WorkflowActivityContext, order: OrderRecord): Promise<void> {
  // State management: persist the order so /status and other services can read it back.
  await daprClient.state.save(STATE_STORE, [{ key: order.orderId, value: order }]);
}

export async function getPaymentApiKeyActivity(_ctx: WorkflowActivityContext): Promise<string> {
  // Secrets: read the (mock) payment gateway API key rather than hardcoding it.
  const secret = (await daprClient.secret.get(SECRET_STORE, "PAYMENT_API_KEY")) as Record<string, string>;
  return secret["PAYMENT_API_KEY"];
}

export async function chargePaymentActivity(
  _ctx: WorkflowActivityContext,
  input: { order: OrderRecord; apiKey: string },
): Promise<OrderRecord> {
  // TODO: implement actual functionality — call a real payment gateway using input.apiKey.
  const paidOrder: OrderRecord = { ...input.order, status: "paid" };
  await daprClient.state.save(STATE_STORE, [{ key: paidOrder.orderId, value: paidOrder }]);
  return paidOrder;
}

export async function publishOrderCompletedActivity(_ctx: WorkflowActivityContext, order: OrderRecord): Promise<void> {
  // Pub/sub: notify other services (shipping, analytics, ...) that the order is complete.
  await daprClient.pubsub.publish(PUBSUB_NAME, ORDER_TOPIC, { ...order, status: "completed" });
}

export async function sendReceiptActivity(_ctx: WorkflowActivityContext, order: OrderRecord): Promise<void> {
  // Bindings: call an output binding to deliver the receipt. The component points at this
  // same app's own /notifications/log route for a self-contained demo — repoint the `url`
  // in resources/binding-receipt.yaml at a real email/SMS provider in production.
  await daprClient.binding.send(BINDING_NAME, "post", {
    message: `Receipt for order ${order.orderId}: $${order.total.toFixed(2)}`,
  });
}

export async function scheduleFollowUpJobActivity(_ctx: WorkflowActivityContext, order: OrderRecord): Promise<void> {
  // Jobs: @dapr/dapr (v3.18.0) does not yet wrap the Jobs API — no client method and no
  // server callback hook — so this calls the Dapr sidecar's HTTP endpoint directly. Dapr
  // POSTs back to /job/<jobName> on this app when the job fires (see src/index.ts).
  const daprHttpPort = process.env.DAPR_HTTP_PORT ?? "3500";
  const jobName = `review-reminder-${order.orderId}`;
  await fetch(`http://localhost:${daprHttpPort}/v1.0/jobs/${jobName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { orderId: order.orderId, customerName: order.customerName },
      dueTime: "60s",
    }),
  });
}
```

### Key points

- The `_ctx: WorkflowActivityContext` parameter provides the activity context (`getWorkflowInstanceId()`, `getWorkflowActivityId()`); prefix it with `_` when unused, matching the rest of the file.
- Activities are where all I/O and non-deterministic operations belong — every Dapr client call in this file (state, secrets, pub/sub, bindings, service invocation, and the raw Jobs HTTP calls) lives here, never in `workflow.ts`.
- `daprClient.invoker.invoke(...)`'s response is typed `Promise<object>` by the SDK; cast it to the shape you expect (`as unknown as PricingResult` here).
- `daprClient.secret.get(...)` returns `Promise<object>` shaped like `{ [key]: value }` — cast it before indexing under `strict` mode.
- `fetch` is available globally in Node.js 18+ — no extra HTTP client dependency needed for the Jobs calls.
- If the exact functionality is unclear, add a `// TODO: implement actual functionality` comment inside the activity function, as done in `chargePaymentActivity`.

## pricing-service/package.json

```json
{
  "name": "pricing-service",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "ts-node src/index.ts"
  },
  "dependencies": {
    "@dapr/dapr": "3.18.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "ts-node": "^10.9.0",
    "@types/node": "^22.0.0"
  }
}
```

`pricing-service/tsconfig.json` is identical to the main app's — see above.

## pricing-service/src/index.ts

A minimal second Dapr app. It exposes one invocable method, called by the main app's `calculatePricingActivity`.

```typescript
import { DaprServer, DaprInvokerCallbackContent, HttpMethod } from "@dapr/dapr";

interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

const TAX_RATE = 0.08;

async function start() {
  const server = new DaprServer();

  await server.invoker.listen(
    "calculate-total",
    async (data: DaprInvokerCallbackContent) => {
      // TODO: implement actual functionality — real pricing/discount/tax rules.
      const { items } = JSON.parse(data.body ?? "{}") as { items: OrderItem[] };
      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const tax = subtotal * TAX_RATE;
      return { subtotal, tax, total: subtotal + tax };
    },
    { method: HttpMethod.POST },
  );

  await server.start();
  console.log("pricing-service is running");
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

### Key points

- `server.invoker.listen(methodName, cb, options)` is the real method — the SDK's own JSDoc examples show a `.handle(...)` method that does not exist and would not compile.
- The callback's `data.body` is a **raw string** the SDK does not parse for you — `JSON.parse` it yourself. This is asymmetric with the client side, where `daprClient.invoker.invoke(...)`'s response comes back already parsed as an `object`.
- `new DaprServer()` with no options relies on `APP_PORT` (defaults to `3000`) — `dapr.yaml` sets it to `3001` for this app via the `appPort` field, which the CLI injects as `APP_PORT` automatically.
- This app has no workflow, no state, and no other building block — it exists solely to be a genuine second service for the service-invocation demo. Calling your own app via service invocation (self-invocation) works mechanically but defeats the point of demonstrating the building block.

## .gitignore

Create a `.gitignore` file in the project root with common Node.js ignore patterns. Use this as the source: https://raw.githubusercontent.com/github/gitignore/refs/heads/main/Node.gitignore

## SDK gotchas to know before you extend this app

Verified against `@dapr/dapr@3.18.0` source — worth knowing before adding to this scaffold:

- **Workflows must be `async function*`, not `function*`.** `TWorkflow`'s declared type says `Generator`, but the runtime dispatches on `Symbol.asyncIterator`, which only an async generator implements. A plain sync generator compiles but misbehaves at runtime.
- **Two workflow client APIs exist in this SDK, and they don't interoperate.** This scaffold exclusively uses `WorkflowRuntime` + `DaprWorkflowClient` (gRPC-based) because it's the only one that can register workflow/activity code. `DaprClient.workflow` is a separate, HTTP-only, management-only API with some deprecated methods (`get`/`start`) — don't mix the two.
- **Don't trust this SDK's own inline JSDoc `@example` blocks.** Several show method names that don't exist and would not compile: `server.invoker.handle(...)` (real: `.listen(...)`), `server.binding.subscribe(...)` (real: `.receive(...)`). Env vars `DAPR_HOST`/`DAPR_PORT`/`DAPR_PROTOCOL` are documented in JSDoc but never actually read by the SDK. Verify any SDK usage you copy from a comment against the actual `.d.ts` file or a real file under `@dapr/dapr`'s own `examples/` directory.
- **A thrown exception in a pub/sub handler does not trigger a retry.** The SDK catches it, logs it, and reports `SUCCESS` anyway. Return `DaprPubSubStatusEnum.RETRY` or `.DROP` explicitly.
- **HTTP vs. gRPC error handling is inconsistent across building blocks** in this SDK version — e.g. `pubsub.publish()` resolves with `{ error }` on HTTP but throws on gRPC; `state.save()`/`state.delete()` catch-and-return on HTTP but reject on gRPC. This scaffold stays on the default HTTP protocol throughout to avoid the inconsistency; wrap calls in `try/catch` if you switch any client to gRPC.
- **`state.get()` discards the etag** on both transports — use `state.getBulk()` (even for a single key) if you need the etag back for optimistic concurrency (`StateConcurrencyEnum`/`StateConsistencyEnum`, both exported from `@dapr/dapr`).
- **The typed service-invocation proxy (`client.proxy.create(...)`) always throws** in this SDK version on both HTTP and gRPC — don't use it, despite an example in the SDK's own repo presenting it as working.
- **Jobs has no client wrapper or server callback hook** in `@dapr/dapr@3.18.0` — only generated proto scaffolding with nothing wired up to a public API. This scaffold talks to the sidecar's `/v1.0/jobs/<name>` HTTP API directly (see `activities.ts`) and exposes a plain `POST /job/<name>` Express route for the trigger callback (see `src/index.ts`). Check `npm view @dapr/dapr version` for a newer release before assuming this is still the case.

## Running Locally

See [`../shared/running-locally-dapr.md`](../shared/running-locally-dapr.md) for instructions.

## Running with Diagrid Catalyst

See [`../shared/running-with-catalyst.md`](../shared/running-with-catalyst.md) for instructions.
