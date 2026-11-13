# Reference: Dapr Workflow TypeScript Application

Package versions come from [dapr-versions.md](../dapr-shared/dapr-versions.md) — change a pin there, not here.

This reference uses the default **Order Processing** scenario. If the user asked for a different scenario, keep the same structure — one activity per building block, plus a companion service invoked over service invocation — but rename files, activities, topics, and components to fit their domain.

Every code sample below — the scaffold files, the workflow patterns, and the 1.19 capabilities section — was compiled with `npx tsc --noEmit` against the real, published **`@dapr/dapr@3.19.0`** package, the version the scaffold pins, on `strict: true`. The `@dapr/dapr` SDK's own inline code comments are not always reliable (see "SDK gotchas" near the end) — the shapes used here are the verified ones, not the documented-but-nonexistent ones.

> **Re-verified at 3.19.0.** The samples were originally written against `3.18.0` and have since been recompiled against `3.19.0` with zero errors; nothing in the 3.18 → 3.19 move removed or renamed an API these samples use. What *did* change is what the SDK now covers: 3.19.0 added a Jobs client and server wrapper, a timeout on `waitForExternalEvent`, activity retry policies, detached workflows, payload references and a replay-safe logger. The notes below describe 3.19.0 behaviour; where a shape differs on `3.18.x`, that is called out inline.

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
    command: ["npm", "start"]
  - appID: pricing-service
    appDirPath: pricing-service
    appPort: 3001
    daprHTTPPort: 3565
    command: ["npm", "start"]
```

### Key points

- `resourcesPath` is shared by both apps' sidecars — `pricing-service` doesn't need most of the components, but loading them all is harmless.
- The secrets building block reads `PAYMENT_API_KEY` through the `secretstores.local.env` component (see `resources/secretstore.yaml`). That component runs in the sidecar and reads the sidecar's environment, and `dapr run -f .` does **not** pass a per-app `env:` map to the sidecar — so the variable is not set here. Export it in the shell before starting the apps (`export PAYMENT_API_KEY="sk-test-demo-51199"` on macOS/Linux, `$env:PAYMENT_API_KEY = "sk-test-demo-51199"` in PowerShell) and include that step in the README.
- `daprHTTPPort` values are chosen away from the Dapr CLI's own default (3500) to avoid colliding with a separately-running default sidecar. `daprGRPCPort` is left unset so the CLI assigns a free port automatically; the SDK reads it back via the `DAPR_GRPC_PORT` environment variable it injects into each app's process (see `WorkflowRuntime`/`DaprWorkflowClient` below — neither is passed an explicit port).
- Use `dapr run -f .` to start both apps and both sidecars with one command.

## resources/statestore.yaml

See [`../dapr-shared/dapr-statestore.md`](../dapr-shared/dapr-statestore.md) for the full example and key points.

## resources/pubsub.yaml

See [`../dapr-shared/dapr-pubsub-redis.md`](../dapr-shared/dapr-pubsub-redis.md) for the full example and key points.

## resources/secretstore.yaml

See [`../dapr-shared/dapr-secretstore-local-env.md`](../dapr-shared/dapr-secretstore-local-env.md) for the full example and key points.

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
    "@dapr/dapr": "3.19.0",
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
  chargePaymentActivity,
  publishOrderCompletedActivity,
  sendReceiptActivity,
  scheduleFollowUpJobActivity,
} from "./activities";
import { OrderInput } from "./models";

const PUBSUB_NAME = "pubsub";
const ORDER_TOPIC = "order-completed";

async function start() {
  // A plain Express app carries our own routes: the workflow management API, which the
  // SDK does not expose over HTTP, and a catch-all Dapr Jobs callback. Passing it in via
  // `serverHttp` puts Dapr's own routes (invoker/pubsub/bindings) on the SAME port
  // instead of opening a second server.
  const app = express();
  app.use(express.json());

  const server = new DaprServer({ serverHttp: app });
  const workflowClient = new DaprWorkflowClient();
  const workflowRuntime = new WorkflowRuntime();

  workflowRuntime
    .registerWorkflow(orderProcessingWorkflow)
    .registerActivity(calculatePricingActivity)
    .registerActivity(saveOrderStateActivity)
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

  // Only include this route when a workflow calls ctx.waitForExternalEvent(...).
  // The request body is passed through as the event payload.
  app.post("/raise-event/:instanceId/:eventName", async (req: Request, res: Response) => {
    await workflowClient.raiseEvent(req.params.instanceId, req.params.eventName, req.body);
    res.json({ status: "event_raised" });
  });

  app.post("/purge/:instanceId", async (req: Request, res: Response) => {
    const purged = await workflowClient.purgeWorkflow(req.params.instanceId);
    res.json({ status: purged ? "purged" : "not_found" });
  });

  // --- Jobs building block: Dapr calls this back when a scheduled job fires ---
  // A catch-all route, because this app schedules one job per order and so cannot know
  // the names up front. `server.jobs.listen(name, cb)` is the SDK alternative and is the
  // better fit for a fixed set of named jobs — see "Jobs: which callback to use" below.
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
- `/raise-event/:instanceId/:eventName` calls `workflowClient.raiseEvent(instanceId, eventName, payload)` and wakes a workflow blocked on `yield ctx.waitForExternalEvent(eventName)`. The default Order Processing workflow does not wait for events, so omit this route unless the workflow uses the external-event pattern (see "External system interaction" below). In the `@dapr/dapr` source, `raiseEvent` does not await the underlying gRPC call, so a `200` response means the event was sent, not that the instance received it — check `/status` to confirm.
- `/purge` only makes sense once an instance has reached a terminal state (Completed/Failed/Terminated); purging a running instance drops its in-flight history.
- Import workflow and activity functions before calling `.start()` so the runtime has them registered — `registerWorkflow`/`registerActivity` must run before `workflowRuntime.start()`, not after.

## src/workflow.ts

A workflow is an `async function*` (not a plain `function*` — see "SDK gotchas" below) referenced directly by `WorkflowRuntime.registerWorkflow(...)`. It orchestrates activities with `yield ctx.callActivity(...)`.

```typescript
import { WorkflowContext, TWorkflow } from "@dapr/dapr";
import {
  calculatePricingActivity,
  saveOrderStateActivity,
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

  // 3. Secrets + state management — charge the order and update its status. The activity
  //    reads the payment API key from the secret store itself: secrets never go through the
  //    workflow (activity inputs and outputs are stored in workflow history).
  record = yield ctx.callActivity(chargePaymentActivity, record);

  // 4. Pub/sub — announce completion.
  yield ctx.callActivity(publishOrderCompletedActivity, record);

  // 5. Bindings (output) — send the receipt.
  yield ctx.callActivity(sendReceiptActivity, record);

  // 6. Jobs — schedule a follow-up reminder.
  yield ctx.callActivity(scheduleFollowUpJobActivity, record);

  const summary: OrderSummary = { orderId: record.orderId, total: record.total, status: "completed" };
  return summary;
};
```

### Key points

- The `ctx: WorkflowContext` parameter provides the workflow context. The `: any` return annotation matches the SDK's own examples — `TWorkflow`'s declared return type doesn't line up cleanly with what a generator function needs to satisfy under `strict` mode (see "SDK gotchas"), and fighting that is not worth it.
- Reference activity functions directly (no string names needed) when calling `registerActivity`/`callActivity` — the SDK derives the registered name from `fn.name`, so activities must be **named** functions, not anonymous arrow functions assigned inline.
- Activities are chained by passing the output of one as the input to the next, same as every other Dapr Workflow SDK.
- **Never pass secrets through the workflow.** Activity inputs and outputs are persisted in the workflow history in the state store, so an API key returned by one activity and passed to another would be stored in plain text. The activity that needs a secret reads it from the secret store itself (see `chargePaymentActivity`).
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
- When a workflow uses this pattern, add the `POST /raise-event/:instanceId/:eventName` route shown in `src/index.ts` and the matching `raise-event` request in `local.http` — otherwise nothing can wake the waiting instance.
- `waitForExternalEvent` **gained a built-in timeout in `@dapr/dapr` 3.19.0**, the version this scaffold pins, so the timer race the 3.18.0 notes prescribed is no longer needed: `yield ctx.waitForExternalEvent<T>("approval-event", { timeoutInSeconds: 3600 })`. The second argument is `ExternalEventOptions` (`timeoutInSeconds`, and `asReference` for payloads kept in a binary store). It returns a `CancellableTask<T>` — a `Task<T>` plus `isCanceled` and `cancel()`, where `cancel()` stops the local wait only and cancels nothing in the Dapr runtime. On `3.18.x` the parameter does not exist and the wait must be raced against `ctx.createTimer(...)` via `ctx.whenAny([...])` instead. Verified against the 3.19.0 type definitions (`node_modules/@dapr/dapr/types/workflow/ExternalEventOptions.type.d.ts`), not re-tested at runtime.
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

See [`../dapr-shared/typescript-local-http.md`](../dapr-shared/typescript-local-http.md) for the full example and key points.

## src/activities.ts

Activities contain the actual business logic and are where I/O happens. Each one below demonstrates one building block, except `chargePaymentActivity`, which combines secrets (it reads the payment API key itself, so the key never enters workflow history) with state management.

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

export async function chargePaymentActivity(_ctx: WorkflowActivityContext, order: OrderRecord): Promise<OrderRecord> {
  // Secrets: read the (mock) payment gateway API key inside the activity that uses it, rather
  // than hardcoding it or returning it to the workflow (activity inputs/outputs are persisted
  // in workflow history, so a returned secret would be stored in the state store).
  const secret = (await daprClient.secret.get(SECRET_STORE, "PAYMENT_API_KEY")) as Record<string, string>;
  const apiKey = secret["PAYMENT_API_KEY"];

  // TODO: implement actual functionality — call a real payment gateway using apiKey.
  void apiKey;
  const paidOrder: OrderRecord = { ...order, status: "paid" };
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
  // Jobs: scheduled through the SDK's Jobs client, added in @dapr/dapr 3.19.0.
  // The job name carries the order id so every order gets its own reminder; Dapr POSTs
  // back to /job/<jobName> on this app when it fires (see src/index.ts).
  await daprClient.jobs.schedule(`review-reminder-${order.orderId}`, {
    dueTime: "60s",
    data: { orderId: order.orderId, customerName: order.customerName },
  });
}
```

### Key points

- The `_ctx: WorkflowActivityContext` parameter provides the activity context (`getWorkflowInstanceId()`, `getWorkflowActivityId()`); prefix it with `_` when unused, matching the rest of the file.
- Activities are where all I/O and non-deterministic operations belong — every Dapr client call in this file (state, secrets, pub/sub, bindings, service invocation and jobs) lives here, never in `workflow.ts`.
- `daprClient.invoker.invoke(...)`'s response is typed `Promise<object>` by the SDK; cast it to the shape you expect (`as unknown as PricingResult` here).
- `daprClient.secret.get(...)` returns `Promise<object>` shaped like `{ [key]: value }` — cast it before indexing under `strict` mode.
- Read secrets in the activity that uses them. Never return a secret from an activity or pass it as activity input: both are written to the workflow history.
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
    "@dapr/dapr": "3.19.0"
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

Verified against `@dapr/dapr` source — worth knowing before adding to this scaffold. Each was re-checked against `3.19.0`; where a gotcha was fixed or superseded in that release, the bullet says so:

- **Workflows must be `async function*`, not `function*`.** `TWorkflow`'s declared type says `Generator`, but the runtime dispatches on `Symbol.asyncIterator`, which only an async generator implements. A plain sync generator compiles but misbehaves at runtime.
- **Two workflow client APIs exist in this SDK, and they don't interoperate.** This scaffold exclusively uses `WorkflowRuntime` + `DaprWorkflowClient` (gRPC-based) because it's the only one that can register workflow/activity code. `DaprClient.workflow` is a separate, HTTP-only, management-only API with some deprecated methods (`get`/`start`) — don't mix the two.
- **Don't trust this SDK's own inline JSDoc `@example` blocks.** Several show method names that don't exist and would not compile: `server.invoker.handle(...)` (real: `.listen(...)`), `server.binding.subscribe(...)` (real: `.receive(...)`). Env vars `DAPR_HOST`/`DAPR_PORT`/`DAPR_PROTOCOL` are documented in JSDoc but never actually read by the SDK. Verify any SDK usage you copy from a comment against the actual `.d.ts` file or a real file under `@dapr/dapr`'s own `examples/` directory.
- **A thrown exception in a pub/sub handler does not trigger a retry.** The SDK catches it, logs it, and reports `SUCCESS` anyway. Return `DaprPubSubStatusEnum.RETRY` or `.DROP` explicitly.
- **HTTP vs. gRPC error handling is inconsistent across building blocks** in this SDK version — e.g. `pubsub.publish()` resolves with `{ error }` on HTTP but throws on gRPC; `state.save()`/`state.delete()` catch-and-return on HTTP but reject on gRPC. This scaffold stays on the default HTTP protocol throughout to avoid the inconsistency; wrap calls in `try/catch` if you switch any client to gRPC.
- **`state.get()` discards the etag** on both transports — use `state.getBulk()` (even for a single key) if you need the etag back for optimistic concurrency (`StateConcurrencyEnum`/`StateConsistencyEnum`, both exported from `@dapr/dapr`).
- **The typed service-invocation proxy (`client.proxy.create(...)`) always throws** in this SDK version on both HTTP and gRPC — don't use it, despite an example in the SDK's own repo presenting it as working.
- **Jobs gained a full client and server wrapper in `@dapr/dapr` 3.19.0.** It had neither in `3.18.0`, which is why older material (and earlier versions of this scaffold) called the sidecar's `/v1.0/jobs/<name>` HTTP API with `fetch`. On the pinned version use `client.jobs.schedule(name, options)` / `.get(name)` / `.delete(name)` instead — the scaffold's `scheduleFollowUpJobActivity` shows the shape. See "Jobs: which callback to use" below for the server side, which is the part that still needs a decision.

## Jobs: which callback to use

Scheduling is settled — use `client.jobs.schedule(...)`. The **callback** side has two shapes, and
the right one depends on whether your job names are known before the app starts.

| | `server.jobs.listen(name, cb)` | Catch-all `app.post("/job/:jobName")` |
|---|---|---|
| Job names | Must be known at startup, matched **exactly** | Any name, including per-instance ones |
| Unregistered name | Logged as a warning and answered **404** — the job fires and is dropped | Handled |
| Registration | Before `server.start()`, one call per name | One Express route |
| Re-registering a name | Throws `A handler for job '<name>' is already registered` | n/a |

This scaffold schedules `review-reminder-${order.orderId}`, a different name per order, so it uses the
catch-all route: there is no startup-time list of names to register. If your app instead has a
fixed set of jobs — `nightly-reconcile`, `hourly-sync` — prefer `server.jobs.listen`, which gives
you per-job handlers and a typed payload:

```typescript
await server.jobs.listen("nightly-reconcile", async (data) => {
  console.log("Reconcile job fired", data);
});
```

The two do not collide. The SDK registers its own `/job/:name` route lazily, on the **first**
`listen()` call, so an app that never calls `listen()` leaves the path free for its own route.
An app that uses both would have the SDK's handler win, and its catch-all would never see a
request — so pick one.

Job options worth knowing (`JobOptions`): `schedule` (a six-field cron, a descriptor such as
`@every 5m`, or a `CronExpressionBuilder`), `dueTime`, `ttl`, `repeats`, `data`, `overwrite`
(**defaults to `false` — scheduling an existing name fails unless you opt in**) and
`failurePolicy`, which is either `{ type: "drop" }` or `{ type: "constant", interval, maxRetries }`.

## What `@dapr/dapr` 3.19.0 adds

The 3.18 → 3.19 move removed and renamed nothing, so existing code keeps compiling. These are the
additions worth reaching for; every snippet here was compiled against 3.19.0.

**Activity and child-workflow retry policies.** `callActivity` takes a third `ActivityOptions`
argument. This is the SDK-side retry; it stacks with any Dapr resiliency policy configured for the
app, so do not configure both for the same call unless you mean the product of the two.

```typescript
const result = yield ctx.callActivity(chargePaymentActivity, order, {
  retryPolicy: {
    firstRetryInterval: 1,      // seconds
    maxNumberOfAttempts: 5,     // includes the initial invocation
    backoffCoefficient: 2,
    maxRetryInterval: 60,
    retryTimeout: 300,
  },
});
```

**Detached workflows.** Fire-and-forget a workflow that outlives the caller. The task yields the
new instance's **ID, not its output** — completion and failure never flow back, so the parent
cannot await or observe it.

```typescript
const childId: string = yield ctx.scheduleNewDetachedWorkflow(reminderWorkflow, { orderId });
```

**Cross-app activities.** `targetAppId` runs an activity in another Dapr app, and
`propagationScope` controls how much history that callee sees — `NONE` (the default),
`OWN_HISTORY` (the caller's own events only) or `LINEAGE` (ancestral history too). Treat the
scope as a trust boundary, not a tuning knob.

```typescript
const quote = yield ctx.callActivity("remoteActivity", input, {
  targetAppId: "pricing-service",
  propagationScope: HistoryPropagationScope.OWN_HISTORY,
});
```

**A replay-safe logger.** `ctx.logger` writes only when the workflow is *not* replaying, which is
what the `if (!ctx.isReplaying())` guard used elsewhere in this reference does by hand. Prefer it
for new code.

```typescript
ctx.logger.info(`processing ${ctx.getWorkflowName()}`);
```

**The patching API.** `ctx.isPatched("add-fraud-check")` is available in this SDK — see
[`../dapr-shared/references/core/versioning.md`](../dapr-shared/references/core/versioning.md).
Note that JavaScript has patching but **no named-version registration**; `WorkflowRuntime` offers
only `registerWorkflow` and `registerWorkflowWithName`.

**Other context additions.** `ctx.getWorkflowName()`, `ctx.newGuid()` (a replay-safe GUID — never
use `crypto.randomUUID()` in a workflow body), `ctx.sendEvent(instanceId, name, payload)` to raise
an event on another instance from inside a workflow, and `ctx.getPropagatedHistory()`.

**Payload references**, for payloads too large to inline. Declare them per registration, then
resolve them inside the workflow with `ctx.resolvePayload(ref)` or stream with
`ctx.openPayload(ref)`; `ctx.hasPayloadResolver()` reports whether a store is configured. This is
the SDK side of the remedy for the silent payload-size stall described in
[`../dapr-shared/references/core/gotchas.md`](../dapr-shared/references/core/gotchas.md) — the
feature is **alpha, and .NET and JS only**.

**New client methods** on `DaprWorkflowClient`: `listWorkflowInstanceIds(continuationToken?,
pageSize?)` (IDs only — there is no server-side filtering beyond paging),
`getWorkflowHistory(instanceId)` and `rerunWorkflowFromEvent(sourceInstanceId, eventId, options?)`,
which starts a **new** instance from a point in an existing one's history. `suspendWorkflow` and
`resumeWorkflow` now take an optional `reason`, and most client calls accept an `AbortSignal`.

## Running Locally

See [`../dapr-shared/running-locally-dapr.md`](../dapr-shared/running-locally-dapr.md) for instructions.

## Running with Diagrid

See [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md) for instructions.
