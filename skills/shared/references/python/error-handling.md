# Python SDK Error Handling

## Overview

Errors in Dapr Workflow Python follow standard Python exception semantics within workflow generator functions.
Activities raise exceptions; the runtime wraps them and re-raises them in the workflow when the `yield`
resolves. Retry policies control how many times an activity is retried before the exception propagates.

## Retry Policies

`RetryPolicy` is imported from `dapr.ext.workflow` and passed to `call_activity` or `call_child_workflow`.

```python
from datetime import timedelta
from dapr.ext.workflow import (
    DaprWorkflowContext,
    WorkflowActivityContext,
    WorkflowRuntime,
    RetryPolicy,
)

wfr = WorkflowRuntime()

retry_policy = RetryPolicy(
    first_retry_interval=timedelta(seconds=1),
    max_number_of_attempts=3,
    backoff_coefficient=2,
    max_retry_interval=timedelta(seconds=30),
    retry_timeout=timedelta(seconds=120),
)


@wfr.activity(name='flaky_activity')
def flaky_activity(ctx: WorkflowActivityContext, item_id: str) -> str:
    # Simulate transient failure
    raise Exception('Transient service error')


@wfr.workflow(name='retry_workflow')
def retry_workflow(ctx: DaprWorkflowContext, item_id: str):
    result = yield ctx.call_activity(
        flaky_activity,
        input=item_id,
        retry_policy=retry_policy,
    )
    return result
```

**RetryPolicy fields:**

| Field | Type | Description |
|-------|------|-------------|
| `first_retry_interval` | `timedelta` | Delay before the first retry |
| `max_number_of_attempts` | `int` | Maximum total attempts (including first) |
| `backoff_coefficient` | `float` | Multiplier applied to interval on each retry |
| `max_retry_interval` | `timedelta` | Cap on the retry interval |
| `retry_timeout` | `timedelta` | Total time budget across all retries |

Only set fields you have a domain-specific reason to override. The defaults are reasonable for most cases.

## Handling Exceptions in Workflows

Wrap `yield ctx.call_activity(...)` in `try/except` to handle activity failures:

```python
@wfr.workflow(name='safe_workflow')
def safe_workflow(ctx: DaprWorkflowContext, order_id: str):
    try:
        result = yield ctx.call_activity(risky_activity, input=order_id)
        return result
    except Exception as e:
        if not ctx.is_replaying:
            print(f'Activity failed for order {order_id}: {e}')
        yield ctx.call_activity(notify_failure, input=str(e))
        raise   # Re-raise to fail the workflow
```

**Key points:**
- Once retries are exhausted, the exception is re-raised at the `yield` site.
- You can catch and handle the exception, call compensation activities, or re-raise.
- Re-raising causes the workflow itself to fail; swallowing allows the workflow to continue.

## Non-Retryable Failures

To signal that an error should not be retried, raise a specific exception type and list it in
`retry_policy`'s non-retryable configuration — or simply do not attach a retry policy at all.

In the Dapr Python SDK the recommended pattern is to mark permanent failures by raising a recognizable
exception class, then in the workflow handle it explicitly:

```python
class PaymentDeclinedError(Exception):
    """Raised when a payment is permanently declined — do not retry."""
    pass


@wfr.activity(name='charge_card')
def charge_card(ctx: WorkflowActivityContext, order_id: str) -> str:
    # Simulate permanent decline
    raise PaymentDeclinedError(f'Card permanently declined for order {order_id}')


@wfr.workflow(name='payment_workflow')
def payment_workflow(ctx: DaprWorkflowContext, order_id: str):
    try:
        result = yield ctx.call_activity(
            charge_card,
            input=order_id,
            retry_policy=RetryPolicy(max_number_of_attempts=3),
        )
        return result
    except PaymentDeclinedError as e:
        # Permanent failure — compensate and fail workflow
        yield ctx.call_activity(notify_declined, input=str(e))
        raise
    except Exception as e:
        # Transient failure after retries exhausted
        yield ctx.call_activity(notify_failure, input=str(e))
        raise
```

**Note:** The Dapr Python SDK does not yet expose a first-class `non_retryable` flag on exceptions (unlike
the .NET/Java SDKs). Use specific exception types and structured `try/except` blocks to distinguish
permanent from transient errors.

## Workflow-Level Error Handling

If a workflow raises an unhandled exception, the workflow instance enters a `FAILED` state. The error
message is captured in the workflow state and accessible via `wf_client.get_workflow_state(instance_id)`.

```python
from dapr.ext.workflow import DaprWorkflowClient

wf_client = DaprWorkflowClient()
state = wf_client.get_workflow_state(instance_id=instance_id)

if state.runtime_status.name == 'FAILED':
    print(f'Workflow failed: {state.failure_details}')
```

## Activity Idempotency

Activities may be retried or re-executed on replay. Design activities to be idempotent:

```python
@wfr.activity(name='create_order')
def create_order(ctx: WorkflowActivityContext, order_id: str) -> str:
    with DaprClient() as client:
        # Use order_id as idempotency key; upsert instead of insert
        existing = client.get_state('statestore', order_id)
        if existing.data:
            return f'Order {order_id} already exists'
        client.save_state('statestore', order_id, '{"status":"created"}')
        return f'Order {order_id} created'
```
