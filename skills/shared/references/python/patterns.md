# Python SDK Patterns

All patterns use verified APIs from `dapr.ext.workflow`. Each example includes the workflow definition,
activity definitions, and registration (all via `WorkflowRuntime` decorators).

---

## Pattern 1: Activity Chaining

Activities execute sequentially; each result feeds the next.

```python
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()


# --- Activities ---

@wfr.activity(name='normalize')
def normalize(ctx: WorkflowActivityContext, text: str) -> str:
    return text.strip().lower()


@wfr.activity(name='validate')
def validate(ctx: WorkflowActivityContext, text: str) -> str:
    if not text:
        raise ValueError('Text cannot be empty after normalization')
    return text


@wfr.activity(name='enrich')
def enrich(ctx: WorkflowActivityContext, text: str) -> str:
    return f'[processed] {text}'


# --- Workflow ---

@wfr.workflow(name='chain_workflow')
def chain_workflow(ctx: DaprWorkflowContext, raw_input: str):
    normalized = yield ctx.call_activity(normalize, input=raw_input)
    validated  = yield ctx.call_activity(validate,  input=normalized)
    enriched   = yield ctx.call_activity(enrich,    input=validated)
    return enriched
```

---

## Pattern 2: Fan-Out / Fan-In

Dispatch multiple activities in parallel; aggregate when all complete.

```python
from typing import List
import dapr.ext.workflow as wf
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()


# --- Activities ---

@wfr.activity(name='get_work_batch')
def get_work_batch(ctx: WorkflowActivityContext, batch_size: int) -> List[int]:
    return list(range(1, batch_size + 1))


@wfr.activity(name='process_item')
def process_item(ctx: WorkflowActivityContext, item: int) -> int:
    return item * 2


@wfr.activity(name='process_results')
def process_results(ctx: WorkflowActivityContext, total: int) -> str:
    return f'Final total: {total}'


# --- Workflow ---

@wfr.workflow(name='fan_out_workflow')
def fan_out_workflow(ctx: DaprWorkflowContext, batch_size: int):
    # Step 1: get the list of work items
    work_batch = yield ctx.call_activity(get_work_batch, input=batch_size)

    # Step 2: schedule all items in parallel
    parallel_tasks = [ctx.call_activity(process_item, input=item) for item in work_batch]

    # Step 3: wait for all to complete
    outputs = yield wf.when_all(parallel_tasks)

    # Step 4: aggregate
    total = sum(outputs)
    summary = yield ctx.call_activity(process_results, input=total)
    return summary
```

**Notes:**
- `when_all(tasks)` waits for every task to complete and returns a list of results in submission order.
- `when_any(tasks)` waits for the first task to complete — useful for timeouts (see Pattern 4).
- If any task raises an exception, `when_all` propagates it.

---

## Pattern 3: External Events (Human-in-the-Loop)

The workflow suspends until an external signal arrives, with an optional timeout.

```python
from dataclasses import dataclass
from datetime import timedelta
import dapr.ext.workflow as wf
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()


@dataclass
class Order:
    order_id: str
    total_cost: float
    item_name: str


# --- Activities ---

@wfr.activity(name='request_approval')
def request_approval(ctx: WorkflowActivityContext, order: dict) -> None:
    print(f'Approval requested for order {order["order_id"]} (${order["total_cost"]})')


@wfr.activity(name='place_order')
def place_order(ctx: WorkflowActivityContext, order: dict) -> str:
    return f'Order {order["order_id"]} placed successfully'


@wfr.activity(name='cancel_order')
def cancel_order(ctx: WorkflowActivityContext, reason: str) -> str:
    return f'Order cancelled: {reason}'


# --- Workflow ---

@wfr.workflow(name='approval_workflow')
def approval_workflow(ctx: DaprWorkflowContext, order: dict):
    # Auto-approve small orders
    if order['total_cost'] < 1000:
        result = yield ctx.call_activity(place_order, input=order)
        return result

    # Large orders need human approval
    yield ctx.call_activity(request_approval, input=order)

    approval_event = ctx.wait_for_external_event('approval_received')
    timeout_event  = ctx.create_timer(timedelta(hours=24))

    winner = yield wf.when_any([approval_event, timeout_event])

    if winner == timeout_event:
        result = yield ctx.call_activity(cancel_order, input='Approval timeout')
        return result

    approved = yield approval_event
    if not approved:
        result = yield ctx.call_activity(cancel_order, input='Approval denied')
        return result

    result = yield ctx.call_activity(place_order, input=order)
    return result
```

**To raise the external event from a client:**

```python
from dapr.ext.workflow import DaprWorkflowClient

wf_client = DaprWorkflowClient()
wf_client.raise_workflow_event(
    instance_id=instance_id,
    event_name='approval_received',
    data=True,   # The approval decision
)
```

---

## Pattern 4: Child Workflows

Decompose large workflows into sub-workflows for reuse and isolation.

```python
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()


# --- Activities ---

@wfr.activity(name='process_payment')
def process_payment(ctx: WorkflowActivityContext, order_id: str) -> bool:
    print(f'Processing payment for order {order_id}')
    return True


@wfr.activity(name='ship_order')
def ship_order(ctx: WorkflowActivityContext, order_id: str) -> str:
    return f'Shipment dispatched for {order_id}'


# --- Child Workflow ---

@wfr.workflow(name='fulfillment_workflow')
def fulfillment_workflow(ctx: DaprWorkflowContext, order_id: str):
    payment_ok = yield ctx.call_activity(process_payment, input=order_id)
    if not payment_ok:
        return f'Payment failed for {order_id}'
    result = yield ctx.call_activity(ship_order, input=order_id)
    return result


# --- Parent Workflow ---

@wfr.workflow(name='batch_order_workflow')
def batch_order_workflow(ctx: DaprWorkflowContext, order_ids: list):
    results = []
    for order_id in order_ids:
        # Each order runs as an independent child workflow
        result = yield ctx.call_child_workflow(
            fulfillment_workflow,
            input=order_id,
            instance_id=f'fulfillment-{order_id}',  # Optional: deterministic ID
        )
        results.append(result)
    return results
```

**Notes:**
- `call_child_workflow` accepts `instance_id` for a deterministic child ID.
- If no `instance_id` is provided, Dapr generates one automatically.
- Child workflows are independently durable — a parent crash does not cancel running children.

---

## Pattern 5: Monitor (Eternal Workflow / continue-as-new)

A recurring workflow that polls status and restarts itself using `continue_as_new`.

```python
from dataclasses import dataclass
from datetime import timedelta
import dapr.ext.workflow as wf
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()


@dataclass
class JobStatus:
    job_id: str
    is_healthy: bool


# --- Activities ---

@wfr.activity(name='check_status')
def check_status(ctx: WorkflowActivityContext, job: dict) -> str:
    # In production: call an external API to check health
    import random
    return random.choice(['healthy', 'unhealthy'])


@wfr.activity(name='send_alert')
def send_alert(ctx: WorkflowActivityContext, message: str) -> None:
    print(f'ALERT: {message}')


# --- Workflow ---

@wfr.workflow(name='status_monitor_workflow')
def status_monitor_workflow(ctx: DaprWorkflowContext, job: dict):
    status = yield ctx.call_activity(check_status, input=job)

    if not ctx.is_replaying:
        print(f"Job '{job['job_id']}' is {status}.")

    if status == 'healthy':
        job['is_healthy'] = True
        next_interval_minutes = 60   # Check less frequently when healthy
    else:
        if job.get('is_healthy', True):
            job['is_healthy'] = False
            yield ctx.call_activity(send_alert, input=f"Job '{job['job_id']}' is unhealthy!")
        next_interval_minutes = 5    # Check more frequently when unhealthy

    # Sleep until next check
    yield ctx.create_timer(
        ctx.current_utc_datetime + timedelta(minutes=next_interval_minutes)
    )

    # Restart this workflow from scratch with updated state
    ctx.continue_as_new(job)
```

**Notes:**
- `continue_as_new` restarts the workflow with a new input and a fresh history, preventing history growth.
- Use `ctx.is_replaying` to suppress duplicate log lines.
- Do NOT use `while True:` loops — use `continue_as_new` for eternal workflows.

---

## Pattern 6: Saga / Compensation

Execute steps sequentially; on failure, undo completed steps in reverse order.

```python
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()


# --- Forward Activities ---

@wfr.activity(name='reserve_inventory')
def reserve_inventory(ctx: WorkflowActivityContext, order_id: str) -> bool:
    print(f'Inventory reserved for {order_id}')
    return True


@wfr.activity(name='charge_payment')
def charge_payment(ctx: WorkflowActivityContext, order_id: str) -> bool:
    print(f'Payment charged for {order_id}')
    return True


@wfr.activity(name='ship_order_saga')
def ship_order_saga(ctx: WorkflowActivityContext, order_id: str) -> str:
    # Simulate a failure to demonstrate compensation
    raise Exception(f'Shipping service unavailable for {order_id}')


# --- Compensation Activities ---

@wfr.activity(name='release_inventory')
def release_inventory(ctx: WorkflowActivityContext, order_id: str) -> None:
    print(f'Inventory released for {order_id}')


@wfr.activity(name='refund_payment')
def refund_payment(ctx: WorkflowActivityContext, order_id: str) -> None:
    print(f'Payment refunded for {order_id}')


# --- Workflow ---

@wfr.workflow(name='saga_workflow')
def saga_workflow(ctx: DaprWorkflowContext, order_id: str):
    compensations = []

    try:
        # Step 1: Reserve inventory
        yield ctx.call_activity(reserve_inventory, input=order_id)
        compensations.append((release_inventory, order_id))

        # Step 2: Charge payment
        yield ctx.call_activity(charge_payment, input=order_id)
        compensations.append((refund_payment, order_id))

        # Step 3: Ship order (may fail)
        result = yield ctx.call_activity(ship_order_saga, input=order_id)
        return result

    except Exception as e:
        if not ctx.is_replaying:
            print(f'Order {order_id} failed: {e}. Running compensations...')

        # Execute compensations in reverse order
        for activity_fn, activity_input in reversed(compensations):
            yield ctx.call_activity(activity_fn, input=activity_input)

        return f'Order {order_id} rolled back'
```

**Notes:**
- Collect compensation tasks as you go; execute them in reverse on failure.
- Each compensation activity should be idempotent — it may be retried.
- Compensations are best-effort: if a compensation activity itself fails with non-transient errors, you may
  need to alert and handle manually.
