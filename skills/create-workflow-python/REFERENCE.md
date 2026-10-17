# Reference: Dapr Workflow Python Application

## dapr.yaml

Create a `dapr.yaml` multi-app run file in the project root. This file configures the Dapr sidecar and points to the resources folder.

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
    command: ["uv", "run", "main.py"]
```

- `resourcesPath` points to the folder containing Dapr component definitions.
- `appDirPath` is the folder containing the Python application.
- Use `dapr run -f dapr.yaml` to start the application with the Dapr sidecar.

## resources/statestore.yaml

See [`../dapr-shared/dapr-statestore.md`](../dapr-shared/dapr-statestore.md) for the full example and key points.

## pyproject.toml

A Python configuration file used by Python tools. It contains a project description, version, minimal python version and dependencies.

Example:

```toml
[project]
name = "<ProjectName>"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "dapr==1.18.0",
    "dapr-ext-workflow==1.18.0",
    "fastapi==0.118.2",
    "pydantic==2.12.0",
    "uvicorn==0.37.0",
]
```

## Models

Define Pydantic types for workflow and activity input/output in a `models.py` file. The types must be serializable since Dapr persists workflow state.

```python
from pydantic import BaseModel

class WorkflowInput(BaseModel):
    id: str
    message: str

class WorkflowOutput(BaseModel):
    result: str

class ActivityInput(BaseModel):
    data: str

class ActivityOutput(BaseModel):
    processed_data: str
```

### Key points

- Place all model types in the `models.py` file.
- Use Pydantic types for built-in serialization support.
- Define separate input and output types for workflows and activities to keep contracts clear.

## runtime.py

The `runtime.py` file creates the shared `WorkflowRuntime` instance. Both `workflow.py` and `activities.py` import `wfr` from this file. This prevents a circular import that would occur if `workflow.py` defined `wfr` and both files imported from each other.

```python
import dapr.ext.workflow as wf

wfr = wf.WorkflowRuntime()
```

### Key points

- `wfr` is the single `WorkflowRuntime` instance shared across the application.
- Both `workflow.py` and `activities.py` import `wfr` from `runtime.py`, not from each other.
- This breaks the circular dependency: `workflow.py` → `activities.py` → `runtime.py` (no cycle).

## main.py

Use FastAPI for HTTP endpoints, `WorkflowRuntime` to register workflows and activities via decorators, and `DaprWorkflowClient` to schedule workflow instances and query their status.

```python
import json

import uvicorn
from fastapi import FastAPI, HTTPException
import dapr.ext.workflow as wf
from runtime import wfr
from workflow import <workflow_name>
from models import WorkflowInput

app = FastAPI()
dapr_client = wf.DaprWorkflowClient()

@app.post("/start")
async def start_workflow(input: WorkflowInput):
    instance_id = dapr_client.schedule_new_workflow(
        workflow=<workflow_name>,
        instance_id=input.id,
        input=input,
    )
    return {"instance_id": instance_id}

@app.get("/status/{instance_id}")
async def get_status(instance_id: str):
    state = dapr_client.get_workflow_state(instance_id)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail=f"Workflow instance '{instance_id}' not found.",
        )

    output = json.loads(state.serialized_output) if state.serialized_output else None
    return {"state": state.to_json(), "output": output}

@app.post("/pause/{instance_id}")
async def pause_workflow(instance_id: str):
    dapr_client.pause_workflow(instance_id)
    return {"status": "paused"}

@app.post("/resume/{instance_id}")
async def resume_workflow(instance_id: str):
    dapr_client.resume_workflow(instance_id)
    return {"status": "resumed"}

@app.post("/terminate/{instance_id}")
async def terminate_workflow(instance_id: str):
    dapr_client.terminate_workflow(instance_id)
    return {"status": "terminated"}

# Generic endpoint: the event name comes from the request body, so keep it in every project.
@app.post("/raise-event/{instance_id}")
async def raise_event(instance_id: str, body: dict):
    dapr_client.raise_workflow_event(
        instance_id,
        event_name=body["event_name"],
        data=body.get("data"),
    )
    return {"status": "event_raised"}

if __name__ == "__main__":
    wfr.start()
    uvicorn.run(app, host="0.0.0.0", port=<app-port>)
```

### Key points

- `wfr` is imported from `runtime.py` — it is the shared `WorkflowRuntime` instance.
- `DaprWorkflowClient()` is used to schedule and query workflow instances.
- `schedule_new_workflow()` starts a new workflow instance and returns the instance ID. Pass `instance_id` to use a user-provided ID. As of 1.18 you can pass a Pydantic model directly to `input=` — the SDK serializes it; no `model_dump()` call is required.
- `get_workflow_state()` retrieves the current status of a workflow instance and returns `None` when the instance does not exist; the status endpoint returns 404 in that case so clients can distinguish "not found" from "completed".
- The status endpoint returns the canonical `{"state": ..., "output": ...}` envelope: `state.to_json()` holds the instance id, name, `runtime_status`, timestamps and (if any) failure details; `output` is the deserialized workflow output, or `None` while the workflow is still running. Do not return `state.__dict__`: `WorkflowState` wraps the underlying object, so `__dict__` exposes only a private attribute instead of the state fields.
- `pause_workflow()`, `resume_workflow()`, and `terminate_workflow()` manage the lifecycle of a workflow instance.
- `raise_workflow_event()` sends a named event (with optional data payload) to a waiting workflow instance, resuming it from a `wait_for_external_event` call.
- `wfr.start()` must be called before the app begins serving requests.
- Import workflow and activity definitions so they are registered with the runtime.

## Workflow definition

A workflow definition uses the `@wfr.workflow(name='<WORKFLOWNAME>')` attribute. The workflow orchestrates one or more activities by calling `ctx.call_activity`. Use types from the `models.py` file for input and output. Workflow names should have a `_workflow` suffix (e.g. `task_chain_workflow`). The `wfr` instance is imported from `runtime.py`.

```python
import dapr.ext.workflow as wf
from runtime import wfr
from activities import step1, step2, step3, error_handler
from models import WorkflowInput

@wfr.workflow(name='my_workflow')
def task_chain_workflow(ctx: wf.DaprWorkflowContext, wf_input: WorkflowInput):
    try:
        result1 = yield ctx.call_activity(step1, input=wf_input)
        result2 = yield ctx.call_activity(step2, input=result1)
        result3 = yield ctx.call_activity(step3, input=result2)
    except Exception as e:
        yield ctx.call_activity(error_handler, input=str(e))
        raise
    return [result1, result2, result3]

```

### Key points

- The `ctx: wf.DaprWorkflowContext` parameter provides the workflow context.
- Use `yield ctx.call_activity(activity_func, input=value)` to call an activity.
- Reference activity functions directly (no string names needed).
- Place workflow functions in `workflow.py`; import `wfr` from `runtime.py`.
- Activities can be chained by passing the output of one as input to the next.
- The workflow's own input is the model passed to `schedule_new_workflow` (hence the `wf_input: WorkflowInput` annotation), but activity outputs and, after `continue_as_new`, the new workflow input arrive inside the workflow as plain dicts, not as model instances. Read fields with `result["field"]`, or rebuild the model first with `Model.model_validate(result)`.
- Guard log/print statements with `if not ctx.is_replaying:` to avoid duplicate output during workflow replay.

### Workflow determinism

Workflow code must be deterministic because the runtime replays the workflow function multiple times to ensure workflow durability. Avoid the following inside a workflow:

- `datetime.now()` — use `ctx.current_utc_datetime` instead.
- Random number or ID generation.
- Direct I/O operations (HTTP calls, file access, database queries) — perform these in activities instead.
- `time.sleep()`  — use `ctx.create_timer()` instead.
- Unbounded loops (`while True:` or a loop whose condition never changes) that schedule activities, child workflows, or timers — every iteration grows the workflow history. Bounded loops (e.g. retry up to N times, iterate over an input list) are fine. For eternal or long-running loops, process one iteration per execution and call `ctx.continue_as_new(<new_input>)`; `continue_as_new` must be the last workflow action, so return immediately after calling it (see the Monitor pattern below).

### Workflow patterns

#### Task chaining

Chain multiple activities by passing each result to the next activity:

```python
@wfr.workflow(name='task_chain_workflow')
def task_chain_workflow(ctx: wf.DaprWorkflowContext, wf_input: int):
    try:
        result1 = yield ctx.call_activity(activity1, input=wf_input)
        result2 = yield ctx.call_activity(activity2, input=result1)
        result3 = yield ctx.call_activity(activity3, input=result2)
    except Exception as e:
        yield ctx.call_activity(error_handler, input=str(e))
        raise
    return [result1, result2, result3]
```

#### Fan-out/fan-in

Execute multiple activities in parallel and wait for all of them to complete:

```python
@wfr.workflow(name='batch_processing_workflow')
def batch_processing_workflow(ctx: wf.DaprWorkflowContext, wf_input: int):
    # get a batch of N work items to process in parallel
    work_batch = yield ctx.call_activity(get_work_batch, input=wf_input)

    # schedule N parallel tasks to process the work items and wait for all to complete
    parallel_tasks = [
        ctx.call_activity(process_work_item, input=work_item) for work_item in work_batch
    ]
    outputs = yield wf.when_all(parallel_tasks)

    # aggregate the results and send them to another activity
    total = sum(outputs)
    yield ctx.call_activity(process_results, input=total)
```

#### Child-workflows

Call another workflow from within a workflow using `ctx.call_child_workflow`:

```python
@wfr.workflow(name='parent_workflow')
def parent_workflow(ctx: wf.DaprWorkflowContext):
    try:
        instance_id = ctx.instance_id
        child_instance_id = instance_id + '-child'
        if not ctx.is_replaying:
            print(f'*** Calling child workflow {child_instance_id}', flush=True)
        yield ctx.call_child_workflow(
            workflow=child_workflow, input=None, instance_id=child_instance_id
        )
    except Exception as e:
        if not ctx.is_replaying:
            print(f'*** Exception: {e}', flush=True)

    return

@wfr.workflow(name='child_workflow')
def child_workflow(ctx: wf.DaprWorkflowContext):
    instance_id = ctx.instance_id
    if not ctx.is_replaying:
        print(f'*** Child workflow {instance_id} called', flush=True)
```

#### Monitor pattern

```python
@wfr.workflow(name='monitor_workflow')
def monitor_workflow(ctx: wf.DaprWorkflowContext, wf_input):
    status = yield ctx.call_activity(check_status, input=wf_input)
    if not status:
        yield ctx.create_timer(timedelta(seconds=30))
        ctx.continue_as_new(wf_input)
        return
    return status
```

##### Key points

- `ctx.continue_as_new(...)` restarts the workflow with a fresh history and the new input, so the monitor can run indefinitely without growing its history.
- `continue_as_new` must be the last workflow action: return immediately after calling it and do not schedule further activities or timers.

#### External system interaction (human-in-the-loop)

Pause the workflow until an external event arrives or a timeout elapses. This is useful for approval flows where a human or external system must respond before the workflow can continue.

```python
from datetime import timedelta

@wfr.workflow(name='approval_workflow')
def approval_workflow(ctx: wf.DaprWorkflowContext, order: dict):
    approval_event_name = "approval-event"
    is_approved = True

    if order["total_price"] > 250:
        try:
            approval_status = yield ctx.wait_for_external_event(
                approval_event_name,
                timeout=timedelta(seconds=120),
            )
            is_approved = approval_status.get("is_approved", False)
        except TimeoutError:
            notification_message = f"Approval request for order {order['id']} timed out."
            if not ctx.is_replaying:
                print(f"*** Approval for order {order['id']} timed out", flush=True)
            yield ctx.call_activity(
                send_notification_activity,
                input=notification_message,
            )
            return notification_message

    if is_approved:
        yield ctx.call_activity(process_order_activity, input=order)

    notification_message = (
        f"Order {order['id']} has been approved."
        if is_approved
        else f"Order {order['id']} has been rejected."
    )
    yield ctx.call_activity(
        send_notification_activity,
        input=notification_message,
    )
    return notification_message
```

##### Key points

- Use `yield ctx.wait_for_external_event(name, timeout=timedelta(...))` to pause the workflow until an event is raised or the timeout elapses.
- The timeout path raises a `TimeoutError` — catch it to run a fallback branch (notification, compensation, etc.).
- Event names should be declared as constants and referenced by both the workflow and the code that raises the event (via `dapr_client.raise_workflow_event()`).
- A workflow can wait for multiple events by calling `wait_for_external_event` multiple times.
- Guard print/log statements with `if not ctx.is_replaying:` to avoid duplicate output during workflow replay.

#### Saga / compensation

Chain forward steps with compensating activities that undo completed work when a later step fails. Return a typed result instead of rethrowing so the workflow instance completes cleanly.

```python
@wfr.workflow(name='order_saga_workflow')
def order_saga_workflow(ctx: wf.DaprWorkflowContext, order_input: dict):
    reservation = yield ctx.call_activity(
        reserve_item_activity,
        input=order_input,
    )

    try:
        payment = yield ctx.call_activity(
            pay_item_activity,
            input=reservation,
        )

        return {
            "is_success": True,
            "message": f"Order {order_input['order_id']} completed. Payment: {payment['transaction_id']}.",
        }
    except Exception as e:
        if not ctx.is_replaying:
            print(f"*** Payment failed for order {order_input['order_id']}: {e}", flush=True)

        yield ctx.call_activity(
            undo_reserve_item_activity,
            input=reservation,
        )

        return {
            "is_success": False,
            "message": f"Order {order_input['order_id']} failed during payment and the reservation was released.",
        }
```

##### Key points

- Each forward step should have a dedicated compensating activity (e.g., `reserve_item_activity` ↔ `undo_reserve_item_activity`).
- Compensations should run in reverse order of the successful forward steps.
- Do not rethrow after compensation — log the failure and return a typed result (e.g., a dict with an `is_success` flag) so the workflow instance completes cleanly and callers can react to the outcome.
- Compensation activities must be idempotent; the workflow runtime may replay them.
- Workflow determinism rules still apply — perform all I/O in activities, never in the workflow body.
- Guard print/log statements with `if not ctx.is_replaying:` to avoid duplicate output during workflow replay.

## local.http

See [`../dapr-shared/python-local-http.md`](../dapr-shared/python-local-http.md) for the full example and key points.

## Activity definition

An activity definition is decorated using `@wfr.activity(name='<ACTIVITY_NAME>')`. Activities contain the actual business logic. Use Pydantic types from the `models.py` file for input and output. Activity definitions should have an `_activity` suffix. Activities import `wfr` from `runtime.py`.

```python
from runtime import wfr
from models import ActivityInput, ActivityOutput

@wfr.activity(name='step1_activity')
def step1(ctx, activity_input: ActivityInput) -> ActivityOutput:
    # Do some work; activities may pass Pydantic models directly to and from
    # the workflow as of dapr-ext-workflow 1.18.
    return ActivityOutput(processed_data=activity_input.data.upper())
```

### Key points

- The `ctx` parameter provides the activity context.
- As of 1.18, activities can accept and return Pydantic models directly; type the `activity_input` parameter and the return value with the models from `models.py`.
- Activities contain the actual business logic (I/O, HTTP calls, database queries).
- Activity functions should have an `_activity` suffix in the decorator name.
- Activities are where non-deterministic and I/O operations should be performed (HTTP calls, database queries, file access, etc.).
- If the exact functionality is unclear, add a `# TODO: implement actual functionality` comment inside the activity function.

## .gitignore

Create a `.gitignore` file in the project root with common Python ignore patterns.Use this as the source: https://raw.githubusercontent.com/github/gitignore/refs/heads/main/Python.gitignore

## Deeper reference

These are not needed to scaffold the project, but answer the questions that come next:

- [`../dapr-shared/references/core/patterns.md`](../dapr-shared/references/core/patterns.md) — the pattern catalogue.
- [`../dapr-shared/references/core/child-workflows.md`](../dapr-shared/references/core/child-workflows.md) — composing workflows.
- [`../dapr-shared/references/core/timers.md`](../dapr-shared/references/core/timers.md) — durable timers.
- [`../dapr-shared/references/core/external-events.md`](../dapr-shared/references/core/external-events.md) — human-in-the-loop and waiting.
- [`../dapr-shared/references/core/testing.md`](../dapr-shared/references/core/testing.md) — how to test a workflow.
- [`../dapr-shared/references/core/versioning.md`](../dapr-shared/references/core/versioning.md) — changing a workflow already in flight.
- [`../dapr-shared/references/core/gotchas.md`](../dapr-shared/references/core/gotchas.md) — the mistakes that bite first.
- [`../dapr-shared/references/core/troubleshooting.md`](../dapr-shared/references/core/troubleshooting.md) — diagnosing a stuck run.
- [`../dapr-shared/references/core/error-reference.md`](../dapr-shared/references/core/error-reference.md) — the error taxonomy.
- [`../dapr-shared/references/core/activity-patterns.md`](../dapr-shared/references/core/activity-patterns.md) — activity shapes.
- [`../dapr-shared/references/core/determinism.md`](../dapr-shared/references/core/determinism.md) — why replay constrains the workflow body.
- [`../dapr-shared/references/ops/monitoring.md`](../dapr-shared/references/ops/monitoring.md) — what to watch in production.
- [`../dapr-shared/references/ops/scaling.md`](../dapr-shared/references/ops/scaling.md) — scaling the workers.
- [`../dapr-shared/references/ops/state-store-selection.md`](../dapr-shared/references/ops/state-store-selection.md) — choosing a state store.
- [`../dapr-shared/references/ops/troubleshooting-ops.md`](../dapr-shared/references/ops/troubleshooting-ops.md) — operational failure modes.
- [`../dapr-shared/references/python/python.md`](../dapr-shared/references/python/python.md) — the python SDK reference.
- [`../dapr-shared/references/python/patterns.md`](../dapr-shared/references/python/patterns.md) — patterns in python.
- [`../dapr-shared/references/python/determinism.md`](../dapr-shared/references/python/determinism.md) — determinism in python.
- [`../dapr-shared/references/python/error-handling.md`](../dapr-shared/references/python/error-handling.md) — error handling in python.
- [`../dapr-shared/references/python/data-handling.md`](../dapr-shared/references/python/data-handling.md) — data handling in python.
- [`../dapr-shared/references/python/gotchas.md`](../dapr-shared/references/python/gotchas.md) — python gotchas.
- [`../dapr-shared/references/python/testing.md`](../dapr-shared/references/python/testing.md) — testing in python.

## Running Locally

See [`../dapr-shared/running-locally-dapr.md`](../dapr-shared/running-locally-dapr.md) for instructions.

## Running with Diagrid Catalyst

See [`../dapr-shared/running-with-catalyst.md`](../dapr-shared/running-with-catalyst.md) for instructions.
