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

Dapr Workflow requires a state store component. Create a `resources` folder in the project root with a `statestore.yaml` file:

```yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: statestore
spec:
  type: state.redis
  version: v1
  metadata:
  - name: redisHost
    value: localhost:6379
  - name: redisPassword
    value: ""
  - name: actorStateStore
    value: "true"
```

- The state store is required for workflow state persistence.
- `actorStateStore` must be set to `"true"` because Dapr Workflow uses the actor framework internally.
- This example uses Redis, which is installed in a container when using the Dapr CLI (`dapr init`).

## pyproject.toml

A Python configuration file used by Python tools. It contains a project description, version, minimal python version and dependencies.

Example:

```toml
[project]
name = "workflow-python"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "dapr==1.17.0",
    "dapr-ext-workflow==1.17.0",
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

## main.py

Use FastAPI for HTTP endpoints, `WorkflowRuntime` to register workflows and activities via decorators, and `DaprWorkflowClient` to schedule workflow instances and query their status.

```python
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
import dapr.ext.workflow as wf
from workflow import wfr, <workflow_name>
from models import WorkflowInput

app = FastAPI()
dapr_client = wf.DaprWorkflowClient()

@app.post("/start")
async def start_workflow(input: WorkflowInput):
    instance_id = dapr_client.schedule_new_workflow(
        workflow=<workflow_name>,
        input=input.model_dump(),
    )
    return {"instance_id": instance_id}

@app.get("/status")
async def get_status(instance_id: str):
    state = dapr_client.get_workflow_state(instance_id)
    return state.__dict__

if __name__ == "__main__":
    wfr.start()
    uvicorn.run(app, host="0.0.0.0", port=<app-port>)
```

### Key points

- `wfr = WorkflowRuntime()` initializes the workflow runtime and is used to register workflows/activities via decorators.
- `DaprWorkflowClient()` is used to schedule and query workflow instances.
- `schedule_new_workflow()` starts a new workflow instance and returns the instance ID.
- `get_workflow_state()` retrieves the current status of a workflow instance.
- `wfr.start()` must be called before the app begins serving requests.
- Import workflow and activity definitions so they are registered with the runtime.

## Workflow definition

A workflow definition uses the `@wfr.workflow(name='<WORKFLOWNAME>')` attribute. The workflow orchestrates one or more activities by calling `ctx.call_activity`. Use types from the `models.py` file for input and output. Workflow names should have a `-workflow` suffix.

```python
@wfr.workflow(name='my_workflow')
def task_chain_workflow(ctx: wf.DaprWorkflowContext, wf_input: int):
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
- Place workflow functions in `workflow.py`.
- Activities can be chained by passing the output of one as input to the next.

### Workflow determinism

Workflow code must be deterministic because the runtime replays the workflow function multiple times to ensure workflow durability. Avoid the following inside a workflow:

- `datetime.now()` — use `ctx.current_utc_datetime` instead.
- Random number or ID generation.
- Direct I/O operations (HTTP calls, file access, database queries) — perform these in activities instead.
- `time.sleep()`  — use `ctx.create_timer()` instead.
- while loops - use context.continue_as_new() instead.

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
        print(f'*** Calling child workflow {child_instance_id}', flush=True)
        yield ctx.call_child_workflow(
            workflow=child_workflow, input=None, instance_id=child_instance_id
        )
    except Exception as e:
        print(f'*** Exception: {e}')

    return

@wfr.workflow(name='child_workflow')
def child_workflow(ctx: wf.DaprWorkflowContext):
    instance_id = ctx.instance_id
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
    return status
```

## local.http

Create a `local.http` file in the project root to test the workflow endpoints:

```http
@host=http://localhost:<app-port>

### Start the workflow
# @name workflowStartRequest
POST {{host}}/start
Content-Type: application/json

{
    "id": "{{$guid}}",
    "key1": "value1"
}

### Get the workflow status
@instanceId={{workflowStartRequest.response.headers.location}}
GET {{host}}/status?instanceId={{instanceId}}
```

### Key points

- The `<app-port>` must match the port in `dapr.yaml` and `main.py`.
- The `start` request matches the `@app.post("/start")` endpoint in `main.py`. The JSON payload should match the workflow input model.
- The `status` request matches the `@app.get("/status")` endpoint in `main.py`.
- Use the VS Code REST Client extension or JetBrains HTTP Client to send requests directly from this file.

## Activity definition

An activity definition is decorated using `@wfr.activity(name='<ACTIVITY_NAME>')`. Activities contain the actual business logic. Use Pydantic types from the `models.py` file for input and output. Activity definitions should have an `_activity` suffix.

```python
@wfr.activity(name='activity1')
def step1(ctx, activity_input):
    print(f'Step 1: Received input: {activity_input}.')
    # Do some work
    return activity_input + 1
```

### Key points

- The `ctx` parameter provides the activity context.
- Activities contain the actual business logic (I/O, HTTP calls, database queries).
- Activity functions should have an `_activity` suffix in the decorator name.
- Activities are where non-deterministic and I/O operations should be performed (HTTP calls, database queries, file access, etc.).
- If the exact functionality is unclear, add a `# TODO: implement actual functionality` comment inside the activity function.

## .gitignore

Create a `.gitignore` file in the project root with common Python ignore patterns.Use this as the source: https://raw.githubusercontent.com/github/gitignore/refs/heads/main/Python.gitignore

## Running Locally

Start the application using the Dapr CLI from the project root:

```shell
dapr run -f .
```

This reads the `dapr.yaml` multi-app run file and launches the app with its Dapr sidecar.

To inspect workflow executions, run the Diagrid Dev Dashboard:

```shell
docker run -p 8080:8080 ghcr.io/diagridio/diagrid-dashboard:latest
```

Then open `http://localhost:8080` in a browser to view workflow instances, their status, and execution history.

## Running with Diagrid Catalyst

Once the workflow app is completely built, run it with [Diagrid Catalyst](https://catalyst.diagrid.io/) to visually inspect the workflow and perform workflow management operations.  

1. Sign up at [catalyst.diagrid.io](https://catalyst.diagrid.io/) and install the [Diagrid CLI](https://docs.diagrid.io/references/catalyst-cli-reference/intro/).
2. Run the application from the project root:

```shell
diagrid dev run --project <ProjectName> -f dapr.yaml --approve
```

**Important:  <ProjectName> must be all lowercase when using the diagrid CLI.**

This uses the same `dapr.yaml` multi-app run file but connects the local workflow application to Catalyst instead of using a local Dapr process, giving access to the Catalyst dashboard for monitoring and managing workflow executions.