# Python SDK Testing

## Overview

Dapr Workflow Python does not ship a dedicated test environment (no equivalent to Temporal's
`WorkflowEnvironment`). Testing relies on:

1. **Unit tests** — test activity functions directly; they are plain Python functions.
2. **Workflow logic tests** — mock `DaprWorkflowContext` to drive workflow generator functions directly.
3. **Integration tests** — run a real Dapr sidecar (e.g., in Docker Compose or a CI container) and
   exercise the full workflow end-to-end.

## Unit Testing Activities

Activities are plain functions with a `WorkflowActivityContext` as the first argument. You can pass a mock
context and call the function directly.

```python
# test_activities.py
from unittest.mock import MagicMock
import pytest
from workflow import verify_inventory_activity, InventoryRequest


def test_verify_inventory_sufficient():
    ctx = MagicMock()  # Activities rarely use ctx directly
    request = InventoryRequest(request_id='order-1', item_name='widget', quantity=5)

    # If the activity uses DaprClient, mock it too
    with patch('workflow.DaprClient') as mock_dapr:
        mock_dapr.return_value.__enter__.return_value.get_state.return_value.data = (
            b'{"name":"widget","quantity":10,"per_item_cost":5}'
        )
        result = verify_inventory_activity(ctx, request)

    assert result.success is True
    assert result.inventory_item.quantity == 10
```

## Testing Workflow Logic (Generator-Based)

Workflow functions are Python generators. You can drive them manually to test branching logic without a
running Dapr sidecar.

```python
# test_workflow_logic.py
from unittest.mock import MagicMock, patch
from workflow import order_processing_workflow


def test_workflow_insufficient_inventory():
    ctx = MagicMock()
    ctx.instance_id = 'test-instance-001'
    ctx.is_replaying = False

    # Simulate activity results in order
    activity_results = iter([
        None,                                 # notify_activity
        MagicMock(success=False, inventory_item=None),  # verify_inventory_activity
        None,                                 # notify_activity (insufficient)
    ])

    ctx.call_activity.side_effect = lambda fn, **kwargs: MagicMock(
        __await__=lambda self: iter([next(activity_results)])
    )

    gen = order_processing_workflow(ctx, '{"item_name":"x","quantity":1,"total_cost":10}')
    # Drive the generator through its yields
    try:
        while True:
            next(gen)
    except StopIteration as e:
        result = e.value

    assert result.processed is False
```

**Note:** Generator-based mocking is complex because `yield` semantics differ from `await`. For most
projects, it is more pragmatic to test branching logic through integration tests against a real sidecar.

## Integration Testing with a Real Sidecar

For reliable end-to-end tests, start a Dapr sidecar alongside your test process. In CI, use Docker Compose
or a sidecar container.

```python
# test_integration.py
import json
import pytest
from time import sleep
from dapr.ext.workflow import DaprWorkflowClient
from workflow import wfr, order_processing_workflow

@pytest.fixture(scope='module', autouse=True)
def start_runtime():
    wfr.start()
    sleep(3)  # Wait for sidecar
    yield
    wfr.shutdown()


def test_order_workflow_completes():
    wf_client = DaprWorkflowClient()
    order = {'item_name': 'cars', 'quantity': 1, 'total_cost': 5000}

    instance_id = wf_client.schedule_new_workflow(
        workflow=order_processing_workflow,
        input=json.dumps(order),
    )

    state = wf_client.wait_for_workflow_completion(
        instance_id=instance_id,
        timeout_in_seconds=30,
    )

    assert state is not None
    assert state.runtime_status.name == 'COMPLETED'
    result = json.loads(state.serialized_output)
    assert result['processed'] is True
```

**CI setup tip:** Use `dapr init` in a CI step before running tests. The `dapr run` command can also be
used to wrap `pytest`:

```bash
dapr run --app-id test-app --dapr-grpc-port 50001 -- pytest tests/
```

## Mocking Activities in Workflow Tests

When you want to test workflow orchestration logic without real activities, substitute the decorated
function with a mock at the `wfr` level:

```python
# In tests, replace the activity with a test double before calling the workflow
original = wfr._registry['verify_inventory_activity']
wfr._registry['verify_inventory_activity'] = mock_verify_fn
# ... run test ...
wfr._registry['verify_inventory_activity'] = original  # restore
```

This approach is fragile; prefer integration tests with a real sidecar when possible.

## Replay Testing Gap

The Dapr Python SDK does not include a `Replayer` class (unlike Temporal Python). There is no first-class
way to validate that a code change is backward-compatible with existing workflow histories. To guard
against replay divergence:

- Write integration tests that start a workflow, kill the worker mid-execution, restart the worker, and
  verify the workflow completes correctly.
- Pin workflow names and activity names in decorators; never rename them without a versioning plan.
- See `references/core/versioning.md` for versioning strategies.
