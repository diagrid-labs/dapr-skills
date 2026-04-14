# Dapr Workflow Python SDK Reference

## Overview

Dapr Workflow for Python is provided by the `dapr-ext-workflow` package, which is part of the `dapr` Python SDK
extensions. Workflows are plain Python generator functions decorated with `@wfr.workflow`. Activities are plain Python
functions decorated with `@wfr.activity`. The `WorkflowRuntime` manages worker startup, and `DaprWorkflowClient`
handles scheduling and lifecycle management.

There is no sandbox: **you** are responsible for writing deterministic workflow code.

## Installation

```bash
pip install dapr dapr-ext-workflow
```

Requires Python 3.9+.

## Workflow Definition

A workflow is a Python generator function that `yield`s activity/child-workflow calls. The function receives a
`DaprWorkflowContext` and an optional input value.

```python
# workflow.py
from dapr.ext.workflow import DaprWorkflowContext, WorkflowActivityContext, WorkflowRuntime

wfr = WorkflowRuntime()

@wfr.workflow(name='greeting_workflow')
def greeting_workflow(ctx: DaprWorkflowContext, name: str):
    greeting = yield ctx.call_activity(say_hello, input=name)
    return greeting
```

## Activity Definition

An activity is a plain Python function decorated with `@wfr.activity`. It receives a `WorkflowActivityContext` and
an optional input value. Activities can call external services, databases, and other I/O-bound operations.

```python
# workflow.py (continued)

@wfr.activity(name='say_hello')
def say_hello(ctx: WorkflowActivityContext, name: str) -> str:
    return f'Hello, {name}!'
```

## App Setup and Registration

Register workflows and activities by decorating them with the `WorkflowRuntime` instance. Start the runtime before
scheduling workflows; shut it down on exit.

```python
# app.py
from time import sleep
from dapr.ext.workflow import DaprWorkflowClient

from workflow import wfr, greeting_workflow

def main():
    wfr.start()
    sleep(2)  # Wait for the sidecar to become available

    wf_client = DaprWorkflowClient()

    instance_id = wf_client.schedule_new_workflow(
        workflow=greeting_workflow,
        input='world',
    )
    print(f'Started workflow instance: {instance_id}')

    state = wf_client.wait_for_workflow_completion(
        instance_id=instance_id,
        timeout_in_seconds=30,
    )
    print(f'Workflow result: {state.serialized_output}')

    wfr.shutdown()

if __name__ == '__main__':
    main()
```

## Run with Dapr

```bash
dapr run --app-id myapp --dapr-grpc-port 50001 -- python app.py
```

## Key Concepts

### Workflow Definition
- Decorate with `@wfr.workflow(name='...')` — the `name` is the workflow type name used for scheduling
- The function must be a Python generator (use `yield` to call activities or child workflows)
- Return value becomes the workflow output
- Use `ctx.instance_id` to get the current workflow instance ID
- Use `ctx.is_replaying` to suppress logging during replay (avoid duplicate log lines)
- Use `ctx.current_utc_datetime` for the current time (replay-safe)

### Activity Definition
- Decorate with `@wfr.activity(name='...')`
- Regular Python functions — no `yield`, no generator protocol
- Can call Dapr APIs using `DaprClient`
- `ctx.task_id` returns the activity task ID

### Runtime Setup
- Create a single `WorkflowRuntime()` instance
- Call `wfr.start()` before scheduling workflows
- Call `wfr.shutdown()` on exit
- Decorators auto-register workflows and activities with the runtime

### File Organization Best Practice

Keep workflow logic and activity logic in separate files to avoid maintenance overhead:

```
my_dapr_app/
├── workflow.py       # Workflow definitions + activity definitions
├── app.py            # Entry point: runtime start, client, scheduling
└── model.py          # Shared dataclasses / models
```

For larger applications, split activities and workflows into separate modules.

## Common Pitfalls

1. **Non-deterministic code in workflows** — use `ctx.current_utc_datetime` for time; delegate I/O to activities
2. **Calling `time.sleep()` in workflows** — use `ctx.create_timer(timedelta(...))` instead
3. **Mutating global state in workflows** — replay will re-run the code; side effects must be idempotent
4. **Not waiting for the sidecar** — add a short `sleep` or retry loop before calling the workflow client
5. **Using `print()` unsafely in workflows** — guard with `if not ctx.is_replaying:` to avoid duplicate output
6. **Missing `yield`** — forgetting `yield ctx.call_activity(...)` means the activity call is never awaited

## Additional Reference Files

- **`references/python/determinism.md`** — Forbidden operations, safe alternatives, no-sandbox implications
- **`references/python/patterns.md`** — Chaining, fan-out/fan-in, external events, child workflows, monitor, saga
- **`references/python/error-handling.md`** — RetryPolicy, exception handling, non-retryable failures
- **`references/python/data-handling.md`** — JSON serialization, dataclasses, Pydantic, payload size
- **`references/python/testing.md`** — pytest patterns, mocking activities, integration testing
- **`references/python/gotchas.md`** — Python-specific anti-patterns and traps
