# Python SDK Gotchas

Python-specific mistakes and anti-patterns. See also `references/core/gotchas.md` for language-agnostic
concepts.

---

## 1. Global Mutable State in Workflows

Workflow code is re-executed on every replay. Any mutation to a global variable persists between replays
and produces inconsistent results.

```python
# BAD — global counter is mutated during replay; value is wrong
counter = 0

@wfr.workflow(name='counter_workflow')
def counter_workflow(ctx, _):
    global counter
    counter += 1    # Replay increments this again and again!
    result = yield ctx.call_activity(process, input=counter)
    return result

# GOOD — pass state through the workflow's own variables
@wfr.workflow(name='counter_workflow')
def counter_workflow(ctx, start_count: int):
    new_count = start_count + 1   # Pure computation — deterministic
    result = yield ctx.call_activity(process, input=new_count)
    return result
```

---

## 2. Import-Time Side Effects

Code at module scope executes once when the module is imported. If that code has side effects (prints,
opens connections, reads files), those side effects do NOT replay — but any state they set is expected to
be present during replay. This asymmetry causes subtle bugs.

```python
# BAD — connection opened at import time; not available on replay-only workers
import redis
_cache = redis.Redis(host='localhost')  # Executes at import time

@wfr.activity(name='cache_lookup')
def cache_lookup(ctx, key: str) -> str:
    return _cache.get(key)   # Assumes _cache was initialized

# GOOD — initialize connection lazily inside the activity
@wfr.activity(name='cache_lookup')
def cache_lookup(ctx, key: str) -> str:
    import redis
    cache = redis.Redis(host='localhost')
    return cache.get(key)
```

---

## 3. Forgetting `yield` on Activity Calls

`ctx.call_activity(...)` returns a task object. Without `yield`, the activity is never awaited and the
return value is the task object itself, not the activity result. This is a silent bug.

```python
# BAD — activity is scheduled but result is never retrieved
@wfr.workflow(name='broken_workflow')
def broken_workflow(ctx, item_id: str):
    result = ctx.call_activity(process_item, input=item_id)  # Missing yield!
    return result   # result is a Task object, not the activity output

# GOOD — always yield activity calls
@wfr.workflow(name='fixed_workflow')
def fixed_workflow(ctx, item_id: str):
    result = yield ctx.call_activity(process_item, input=item_id)
    return result
```

---

## 4. Using `time.sleep()` Instead of a Durable Timer

`time.sleep()` in a workflow blocks the thread and creates no history entry. After a worker restart, the
sleep is not replayed — the workflow logic jumps over it as if it never happened.

```python
# BAD — blocks the thread; no history record; skipped on replay
import time

@wfr.workflow(name='sleep_workflow')
def sleep_workflow(ctx, _):
    time.sleep(60)    # NOT durable
    result = yield ctx.call_activity(do_work)
    return result

# GOOD — durable timer recorded in history; replayed correctly
from datetime import timedelta

@wfr.workflow(name='sleep_workflow')
def sleep_workflow(ctx, _):
    yield ctx.create_timer(timedelta(minutes=1))   # Durable
    result = yield ctx.call_activity(do_work)
    return result
```

---

## 5. `set()` Iteration Order

Set iteration order in Python is not guaranteed. If a workflow iterates over a `set`, the order can differ
between the original execution and replay, causing a non-determinism error.

```python
# BAD — set iteration is non-deterministic
@wfr.workflow(name='set_workflow')
def set_workflow(ctx, item_ids: list):
    id_set = set(item_ids)   # Order not guaranteed!
    for item_id in id_set:
        yield ctx.call_activity(process, input=item_id)

# GOOD — always sort before iterating in workflow code
@wfr.workflow(name='set_workflow')
def set_workflow(ctx, item_ids: list):
    for item_id in sorted(set(item_ids)):   # Deterministic order
        yield ctx.call_activity(process, input=item_id)
```

---

## 6. Non-Deterministic `dict` Construction

In Python 3.7+, `dict` preserves insertion order. However, `dict.fromkeys()`, `**kwargs` merging, and
JSON deserialization all produce insertion-ordered dicts — this is generally safe. Be cautious with
`**{...}` merges from multiple sources where order is not guaranteed at the call site.

---

## 7. Using `datetime.now()` or `time.time()` in Workflows

Wall-clock time returns a different value on replay. Use `ctx.current_utc_datetime` instead.

```python
# BAD
from datetime import datetime

@wfr.workflow(name='timestamped_workflow')
def timestamped_workflow(ctx, _):
    ts = datetime.now().isoformat()   # Different on replay!

# GOOD
@wfr.workflow(name='timestamped_workflow')
def timestamped_workflow(ctx, _):
    ts = ctx.current_utc_datetime.isoformat()   # Deterministic
```

---

## 8. Duplicate Log Output Without `is_replaying` Guard

Workflow code runs multiple times during replay. `print()` and logging calls execute every time.

```python
# BAD — prints on every replay; floods logs
@wfr.workflow(name='noisy_workflow')
def noisy_workflow(ctx, order_id: str):
    print(f'Processing order {order_id}')   # Prints multiple times
    result = yield ctx.call_activity(process_order, input=order_id)
    return result

# GOOD — suppress logging during replay
@wfr.workflow(name='quiet_workflow')
def quiet_workflow(ctx, order_id: str):
    if not ctx.is_replaying:
        print(f'Processing order {order_id}')
    result = yield ctx.call_activity(process_order, input=order_id)
    return result
```

---

## 9. Blocking I/O in Activities (sync vs. async confusion)

The Dapr Python SDK activities run synchronously. Blocking I/O (file reads, HTTP calls with `requests`)
is fine in activities. However, mixing `async def` activity functions with a synchronous runtime can cause
unexpected behavior — the SDK does not natively support `async def` activity functions in the same way as
Temporal.

```python
# BAD — async activity may not be awaited correctly by the sync Dapr runtime
@wfr.activity(name='async_activity')
async def async_activity(ctx, url: str) -> str:
    import aiohttp
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            return await resp.text()

# GOOD — use synchronous HTTP in activities
@wfr.activity(name='sync_activity')
def sync_activity(ctx, url: str) -> str:
    import requests
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    return response.text
```

---

## 10. Not Waiting for Sidecar Availability

`DaprWorkflowClient()` connects immediately. If the sidecar is not yet ready, calls fail. Always add a
short startup delay or retry loop before scheduling workflows.

```python
# In app.py
from time import sleep

wfr.start()
sleep(3)   # Wait for sidecar to become available
wf_client = DaprWorkflowClient()
```

---

## 11. Infinite `while True` Loops

Do not use `while True:` loops in workflow code. They cause unbounded history growth and memory issues.
Use `continue_as_new` for recurring workflows.

```python
# BAD — history grows unboundedly
@wfr.workflow(name='polling_workflow')
def polling_workflow(ctx, job_id: str):
    while True:
        status = yield ctx.call_activity(check_status, input=job_id)
        if status == 'done':
            break
        yield ctx.create_timer(timedelta(minutes=5))

# GOOD — use continue_as_new
@wfr.workflow(name='polling_workflow')
def polling_workflow(ctx, job_id: str):
    status = yield ctx.call_activity(check_status, input=job_id)
    if status != 'done':
        yield ctx.create_timer(timedelta(minutes=5))
        ctx.continue_as_new(job_id)
```
