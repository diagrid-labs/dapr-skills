# Python SDK Data Handling

## Overview

Dapr Workflow Python serializes activity inputs and outputs as JSON. Any value passed to `input=` on
`call_activity` or `call_child_workflow` must be JSON-serializable. Return values from activities are also
JSON-serialized before being stored in workflow history.

## Basic JSON Serialization

Primitive types (`str`, `int`, `float`, `bool`, `None`) and standard collections (`list`, `dict`) serialize
automatically.

```python
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()


@wfr.activity(name='compute_total')
def compute_total(ctx: WorkflowActivityContext, items: list) -> float:
    return sum(item['price'] * item['quantity'] for item in items)


@wfr.workflow(name='order_workflow')
def order_workflow(ctx: DaprWorkflowContext, order: dict):
    total = yield ctx.call_activity(compute_total, input=order['items'])
    return {'order_id': order['order_id'], 'total': total}
```

## Dataclasses as Input/Output

`dataclass` instances are NOT JSON-serializable by default. Use a helper or convert to `dict` explicitly.

```python
from dataclasses import dataclass, asdict
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()


@dataclass
class OrderRequest:
    order_id: str
    item_name: str
    quantity: int
    total_cost: float

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> 'OrderRequest':
        return cls(**data)


@wfr.activity(name='validate_order')
def validate_order(ctx: WorkflowActivityContext, order_data: dict) -> dict:
    order = OrderRequest.from_dict(order_data)
    if order.quantity <= 0:
        raise ValueError(f'Invalid quantity: {order.quantity}')
    return {'valid': True, 'order_id': order.order_id}


@wfr.workflow(name='dataclass_workflow')
def dataclass_workflow(ctx: DaprWorkflowContext, order_data: dict):
    result = yield ctx.call_activity(validate_order, input=order_data)
    return result


# When scheduling, convert the dataclass to dict:
# instance_id = wf_client.schedule_new_workflow(
#     workflow=dataclass_workflow,
#     input=order.to_dict(),
# )
```

## Pydantic Models

Pydantic v2 models serialize cleanly using `.model_dump()` and deserialize with `Model.model_validate()`.

```python
from pydantic import BaseModel
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()


class PaymentRequest(BaseModel):
    order_id: str
    amount: float
    currency: str = 'USD'


@wfr.activity(name='process_payment')
def process_payment(ctx: WorkflowActivityContext, payload: dict) -> dict:
    request = PaymentRequest.model_validate(payload)
    # ... process payment ...
    return {'transaction_id': f'txn-{request.order_id}', 'status': 'charged'}


@wfr.workflow(name='pydantic_workflow')
def pydantic_workflow(ctx: DaprWorkflowContext, payload: dict):
    result = yield ctx.call_activity(process_payment, input=payload)
    return result


# When scheduling:
# req = PaymentRequest(order_id='abc', amount=99.99)
# wf_client.schedule_new_workflow(workflow=pydantic_workflow, input=req.model_dump())
```

## Payload Size Considerations

- Dapr stores workflow history in its state store (default: Redis). Large payloads inflate history.
- Keep activity inputs and outputs small — pass IDs and references, not full document bodies.
- For large data (files, large JSON blobs), store the data externally (e.g., object storage, state store)
  and pass only the key/reference through the workflow.

```python
@wfr.activity(name='save_report')
def save_report(ctx: WorkflowActivityContext, report: dict) -> str:
    report_id = report['id']
    with DaprClient() as client:
        # Store the large blob externally; return only the ID
        client.save_state('reportstore', report_id, json.dumps(report['data']))
    return report_id   # Small reference — safe to pass through workflow history


@wfr.workflow(name='report_workflow')
def report_workflow(ctx: DaprWorkflowContext, order_id: str):
    report = yield ctx.call_activity(generate_report, input=order_id)
    report_id = yield ctx.call_activity(save_report, input=report)
    return {'report_id': report_id}  # Only the ID in the workflow output
```

## Serializing Workflow Output

The workflow return value is stored as JSON in `state.serialized_output` (a JSON string). Deserialize it
when reading:

```python
import json
state = wf_client.wait_for_workflow_completion(instance_id=instance_id, timeout_in_seconds=30)
result = json.loads(state.serialized_output)
```
