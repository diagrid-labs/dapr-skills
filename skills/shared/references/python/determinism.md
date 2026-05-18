# Python SDK Determinism

## Overview

Dapr Workflow achieves durable execution through **history replay**. When a worker restarts or resumes a
workflow, it re-executes the workflow generator function from the beginning, replaying recorded events to
reconstruct state. This means **workflow code must produce the same sequence of calls on every replay**.

Unlike the Temporal Python SDK, **Dapr Python has no sandbox**. There is no automatic interception of
non-deterministic operations. Violations cause silent divergence or non-determinism errors at runtime.

## Why Determinism Matters: History Replay

1. Worker crashes and restarts mid-workflow.
2. Dapr replays the workflow from the event history.
3. If the code produces a different call sequence (different activity names, different order), the replay
   diverges and the workflow fails with a non-determinism error.

## Forbidden Operations in Workflow Code

| Forbidden | Why | Safe Alternative |
|-----------|-----|-----------------|
| `datetime.now()` / `datetime.utcnow()` | Returns wall-clock time, different on replay | `ctx.current_utc_datetime` |
| `time.time()` | Same as above | `ctx.current_utc_datetime.timestamp()` |
| `random.random()` / `random.choice()` | Non-deterministic | Move to an activity |
| `uuid.uuid4()` | Random value | Move to an activity or use `ctx.instance_id` as seed |
| `time.sleep()` | Blocks the thread without recording | `yield ctx.create_timer(timedelta(...))` |
| `os.environ` reads | Environment may differ across workers | Move to activity or pass as workflow input |
| `os.path.exists()` / file reads | I/O is non-deterministic | Move to an activity |
| Network calls (`requests`, `httpx`, etc.) | I/O is non-deterministic and fallible | Move to an activity |
| Threading (`threading.Thread`) | Cannot be replayed | Not supported in workflows |
| Global mutable state writes | Persists between replays, breaks isolation | Use activity output passed through workflow |

## No Sandbox — You Are Responsible

Temporal Python uses a sandbox that restricts and intercepts many non-deterministic calls automatically. Dapr
Python has no equivalent. There is no runtime guard to catch `datetime.now()` in workflow code. The burden is
entirely on you to audit workflow functions.

**Rule of thumb:** If a workflow function does anything other than `yield ctx.call_activity(...)`,
`yield ctx.call_child_workflow(...)`, `yield ctx.create_timer(...)`, `yield ctx.wait_for_external_event(...)`,
`ctx.continue_as_new(...)`, or pure in-memory computation on previously-retrieved values — move it to an activity.

## Safe Alternatives

### Time

```python
# WRONG — wall-clock time differs on every replay
from datetime import datetime
def my_workflow(ctx, _):
    now = datetime.now()  # Non-deterministic!

# CORRECT — replay-safe timestamp provided by the runtime
def my_workflow(ctx, _):
    now = ctx.current_utc_datetime          # datetime object, deterministic
    ts  = ctx.current_utc_datetime.timestamp()  # float Unix timestamp
```

### Random Values and UUIDs

```python
# WRONG — different value on every replay
import random, uuid
def my_workflow(ctx, _):
    token = str(uuid.uuid4())     # Non-deterministic!
    roll  = random.randint(1, 6)  # Non-deterministic!

# CORRECT — delegate to an activity
@wfr.activity(name='generate_token')
def generate_token(ctx) -> str:
    import uuid
    return str(uuid.uuid4())

def my_workflow(ctx, _):
    token = yield ctx.call_activity(generate_token)
```

### Sleeping / Timers

```python
# WRONG — does not record to history; breaks on replay
import time
def my_workflow(ctx, _):
    time.sleep(60)   # Blocks thread, no history entry

# CORRECT — durable timer recorded to history
from datetime import timedelta
def my_workflow(ctx, _):
    yield ctx.create_timer(timedelta(minutes=1))
```

### Environment and File I/O

```python
# WRONG — environment or filesystem may differ on replay
import os
def my_workflow(ctx, _):
    endpoint = os.environ['API_ENDPOINT']   # Not deterministic across workers!

# CORRECT — pass configuration as workflow input, or read it in an activity
@wfr.activity(name='get_config')
def get_config(ctx) -> dict:
    import os
    return {'endpoint': os.environ['API_ENDPOINT']}

def my_workflow(ctx, _):
    config = yield ctx.call_activity(get_config)
```

### Non-Deterministic Iteration

```python
# CAUTION — set() iteration order is not guaranteed in Python
def my_workflow(ctx, items_set):
    for item in items_set:              # Order is non-deterministic!
        yield ctx.call_activity(process, input=item)

# CORRECT — sort before iterating
def my_workflow(ctx, items_set):
    for item in sorted(items_set):
        yield ctx.call_activity(process, input=item)
```

`dict` iteration is insertion-ordered in Python 3.7+, but sets are never ordered. Always sort before iterating
in workflow code if the order matters for replay correctness.

## Logging in Workflows

`print()` and `logging` calls execute on every replay. This causes duplicate log lines but is not incorrect.
To suppress duplicate output, guard with `ctx.is_replaying`:

```python
def my_workflow(ctx, order_id: str):
    if not ctx.is_replaying:
        print(f'Processing order {order_id}')
    result = yield ctx.call_activity(process_order, input=order_id)
    return result
```

## Import-Time Side Effects

Avoid side effects at module import time (e.g., opening connections, reading files, printing). These execute
once at startup but not during replay — this asymmetry can cause subtle bugs if the workflow assumes the
side effect happened during the generator's execution.

## Testing Replay Correctness

There is no built-in `Replayer` class in the Dapr Python SDK (unlike Temporal). Replay correctness must be
validated through integration tests that restart workers mid-workflow and verify the workflow completes
correctly. See `references/python/testing.md`.
