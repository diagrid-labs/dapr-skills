# Dapr Workflow Patterns

## Overview

Common patterns for building robust Dapr Workflows. This document covers the conceptual design and trade-offs for each pattern. For language-specific code examples, see:

- `references/go/patterns.md`
- `references/dotnet/patterns.md`
- `references/java/patterns.md`
- `references/python/patterns.md`
- `references/javascript/patterns.md`

**Key difference from Temporal:** Temporal has Signals, Queries, and Updates as first-class concepts. Dapr does NOT have these. The equivalents in Dapr are:

| Temporal | Dapr Equivalent |
|----------|----------------|
| Signal | `WaitForExternalEvent` / `RaiseEvent` |
| Query | Management API (`GET /v1.0/workflows/{instanceID}`) |
| Update | No direct equivalent — use external events |

---

## External Events

**Purpose**: Send data to a running workflow asynchronously (fire-and-forget).

**When to Use**:
- Human approval workflows
- Notifying a workflow of external system outcomes
- Adding items to a workflow's processing queue
- Triggering phase transitions in long-running workflows

**Characteristics**:
- Asynchronous — sender does not wait for workflow response
- Durable — events are persisted in history before being consumed
- Can include a timeout using durable timers (see Human-in-the-Loop pattern)
- Events are dispatched FIFO if multiple events with the same name are pending
- If an event arrives before the workflow calls `WaitForExternalEvent`, the event is buffered in history and consumed immediately when the workflow requests it

**Example Flow**:

```
Client (HTTP / CLI / another workflow)
  │
  │──── RaiseEvent("approval", payload) ──▶ Dapr sidecar
  │                                              │
  │                                              │ persists event in history
  │                                              ▼
  │                                         Workflow resumes
  │                                              │
  │◀──── (no response — fire and forget) ────────│
  │                                              │ reads payload, continues
```

**Raising an event via CLI**:

```bash
dapr workflow raise-event <instance-id>/ApprovalReceived \
  --app-id myapp \
  --input '{"approved": true}'
```

**Note**: Unlike Temporal Signals, there is no "signal-with-start" in Dapr. You must start the workflow first before raising events to it. If the workflow is not yet listening for the named event, the event is buffered.

---

## Activity Chaining

**Purpose**: Sequential processing pipeline where each step uses the output of the previous step.

**When to Use**:
- Ordered processing with data dependencies between steps
- ETL pipelines (extract → transform → load)
- Multi-stage validation or enrichment flows
- Order processing (verify → charge → ship)

**Characteristics**:
- Each activity is executed exactly once (at-least-once with idempotent design)
- Failure at any step surfaces an error to the workflow; prior steps are not rolled back automatically (use the Saga pattern for compensation)
- Built-in retry policies can be configured per activity call
- Progress is checkpointed after each activity completes — restarts resume from the last completed step

**Example Flow**:

```
Workflow
  │
  ├──── CallActivity(Step1, input) ──▶ result1
  │
  ├──── CallActivity(Step2, result1) ──▶ result2
  │
  └──── CallActivity(Step3, result2) ──▶ result3
```

**Gotcha**: Changing the order or number of activities in a running workflow breaks replay determinism. See `references/core/determinism.md` for safe update strategies.

---

## Fan-out / Fan-in

**Purpose**: Execute multiple independent tasks in parallel, then aggregate all results.

**When to Use**:
- Batch processing where items are independent
- Calling multiple external APIs simultaneously
- Map-reduce pipelines
- Parallel data enrichment or validation

**Characteristics**:
- Activities are scheduled concurrently without waiting for each other
- The workflow awaits all tasks before proceeding (fan-in)
- Number of parallel tasks can be dynamic (determined at runtime)
- Durable — if a crash occurs mid-fan-out, the workflow resumes and only re-schedules incomplete tasks

**Example Flow**:

```
Workflow
  │
  ├──── CallActivity(Process, item1) ──▶ [scheduled, not awaited yet]
  ├──── CallActivity(Process, item2) ──▶ [scheduled, not awaited yet]
  ├──── CallActivity(Process, itemN) ──▶ [scheduled, not awaited yet]
  │
  │     (all tasks running concurrently)
  │
  ├──── Await all tasks ──────────────▶ [results: r1, r2, ..., rN]
  │
  └──── CallActivity(Aggregate, results)
```

**Gotcha**: Every activity result is stored in workflow history. For large fan-outs with large payloads, history can grow quickly. Keep individual activity payloads small — use references (storage keys, IDs) rather than inline data for large objects.

---

## Saga / Compensation

**Purpose**: Implement distributed transactions that can be rolled back on failure.

**When to Use**:
- Multi-service operations that must be atomic (e.g., charge → reserve → ship)
- Financial transactions spanning multiple systems
- Booking systems with multiple reservation steps
- Any sequence where partial completion leaves the system in an inconsistent state

**Characteristics**:
- Forward steps are executed in order
- Each completed step registers a corresponding compensation action
- On failure, compensations are executed in **reverse order**
- No two-phase commit — relies on eventual consistency via compensation
- Compensation activities must also be idempotent (they may be retried)

**Example Flow — Success Path**:

```
Workflow
  ├──── Step 1: ReserveInventory ──▶ ok
  ├──── Step 2: ChargePayment ──────▶ ok
  └──── Step 3: CreateShipment ─────▶ ok  (done)
```

**Example Flow — Failure Path**:

```
Workflow
  ├──── Step 1: ReserveInventory ──▶ ok  (compensate: ReleaseInventory)
  ├──── Step 2: ChargePayment ──────▶ ok  (compensate: RefundPayment)
  └──── Step 3: CreateShipment ─────▶ FAIL
          │
          ▼  execute compensations in reverse
  ├──── Compensate Step 2: RefundPayment
  └──── Compensate Step 1: ReleaseInventory
```

**Implementation Pattern**: Track compensation actions as a list as you complete each forward step. On error, iterate the list in reverse and execute each compensation activity.

**Gotcha**: If a compensation activity itself fails, you need a strategy — log and alert for manual intervention, or implement a retry policy specifically for compensations. Do not silently swallow compensation failures.

---

## Human-in-the-Loop

**Purpose**: Pause workflow execution until a human makes a decision, with an optional deadline.

**When to Use**:
- Approval workflows (expense, purchase order, content moderation)
- Manual review gates in automated pipelines
- Customer confirmation steps
- Escalation flows with time-bounded SLAs

**Characteristics**:
- Workflow suspends at `WaitForExternalEvent` — no CPU or memory consumed while waiting
- Can combine with a durable timer to implement a deadline/timeout
- On timeout, the workflow can take an alternate path (auto-reject, escalate, notify)
- The approval event is delivered via `RaiseEvent` from an external system (webhook, UI, CLI)

**Example Flow**:

```
Workflow
  │
  ├──── CallActivity(RequestApproval, payload) ──▶ sends notification
  │
  ├──── WaitForExternalEvent("approval", timeout=48h)
  │         │
  │         ├── Event received before timeout:
  │         │       └──── Continue with approved/rejected payload
  │         │
  │         └── Timeout expires:
  │                 └──── Auto-reject or escalate
  │
  └──── CallActivity(Notify, result)
```

**Raising the approval event**:

```bash
dapr workflow raise-event <instance-id>/approval \
  --app-id myapp \
  --input '{"approved": true, "reviewer": "manager@example.com"}'
```

**Note**: The timeout is implemented using a durable timer internally. If the worker restarts, the timer survives and fires at the correct time.

---

## Eternal / Monitor Workflow

**Purpose**: Long-running workflow that monitors or polls indefinitely without unbounded history growth.

**When to Use**:
- Health monitoring agents (poll a service, alert on degradation)
- Periodic data sync or reconciliation loops
- SLA tracking (alert if response time exceeds threshold)
- Subscription lifecycle management

**Characteristics**:
- Uses `ContinueAsNew` to restart with fresh history on each cycle
- Passes current state as input to the new execution (same instance ID)
- The workflow ID remains constant across all continuations
- Sleep duration between cycles is implemented with a durable timer

**Example Flow**:

```
Workflow Execution #1 (history: growing)
  │
  ├──── CallActivity(CheckStatus)
  ├──── CreateTimer(interval: 5 minutes)
  └──── ContinueAsNew(currentState)
          │
          ▼
Workflow Execution #2 (history: reset to 0 events)
  │
  ├──── CallActivity(CheckStatus)
  ├──── CreateTimer(interval: 5 minutes)
  └──── ContinueAsNew(currentState)
          │
          ▼  (repeats indefinitely)
```

**CRITICAL**: Do NOT implement this pattern as an infinite `while(true)` loop without `ContinueAsNew`. Without it, the event history grows without bound, consuming increasing memory and storage, and eventually causing replay failures or performance degradation.

**Best Practice**: Trigger `ContinueAsNew` at the end of each cycle, or when history length approaches a threshold (e.g., 500+ events per cycle).

---

## Sub-orchestration (Child Workflows)

**Purpose**: Decompose a complex workflow into independently managed sub-workflows.

**When to Use**:
- Reusable sub-processes that multiple parent workflows invoke
- Isolating failure domains — child failure can be handled by the parent without failing the entire workflow
- Fan-out to workflow-level parallelism where each branch has its own durable history
- Reducing parent history size by delegating work to children with independent histories

**Characteristics**:
- Each child workflow has its own instance ID, history, and status
- Child workflows support the same retry policies and features as top-level workflows
- A parent can `await` child completion, or fire-and-forget
- Terminating a parent workflow **recursively terminates all child workflows** it created

**Example Flow**:

```
Parent Workflow (instance: parent-001)
  │
  ├──── StartChildWorkflow(ProcessRegion, "us-east", instanceID: "child-us-east")
  ├──── StartChildWorkflow(ProcessRegion, "eu-west", instanceID: "child-eu-west")
  ├──── StartChildWorkflow(ProcessRegion, "ap-south", instanceID: "child-ap-south")
  │
  │     (children run independently, own histories)
  │
  └──── Await all children ──▶ aggregate results

Child Workflow (instance: child-us-east)
  ├──── CallActivity(FetchData, "us-east")
  ├──── CallActivity(Transform, data)
  └──── CallActivity(Store, result)
```

**Lifecycle**:

| Action | Effect |
|--------|--------|
| Terminate parent | All children are also terminated |
| Purge parent | Children are NOT automatically purged |
| Child fails | Error surfaced to parent; parent decides to retry, compensate, or fail |

**Gotcha**: Child instance IDs must be unique at the time of creation. If a child with the same ID already exists and is still running, the `StartChildWorkflow` call will fail. Use deterministic IDs (e.g., `parentID + "-" + regionName`) to make this idempotent on replay.

---

## Choosing Between Patterns

| Need | Pattern |
|------|---------|
| Sequential steps, each using previous output | Activity Chaining |
| Parallel independent tasks, aggregate results | Fan-out / Fan-in |
| Rollback on failure across services | Saga / Compensation |
| Pause for human decision with deadline | Human-in-the-Loop |
| Fire-and-forget notification to workflow | External Events |
| Long-running loop without history bloat | Eternal / Monitor Workflow |
| Reusable sub-processes, isolate failure | Sub-orchestration |
| Prevent history growth in long-lived workflows | ContinueAsNew (used by Eternal pattern) |
