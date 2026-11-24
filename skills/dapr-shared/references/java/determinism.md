# Java SDK Determinism

## Overview

Dapr Workflow is durable because it **replays** the workflow body from its history: every time a run resumes
(after an activity, a timer, an event or a restart), the `WorkflowStub` lambda runs again from the top, and
each `.await()` on a task already in the history returns the recorded result. The body must therefore make
the same calls in the same order on every replay. The Java SDK has no sandbox; nothing stops a
non-deterministic call at compile time. A replay that schedules something the history does not have fails the
run with `NonDeterministicOrchestratorException` ("Non-deterministic orchestrator detected").

Why replay works this way, for every SDK: [core/determinism.md](../core/determinism.md).

## Forbidden calls and their replacements

| Forbidden in a workflow | Why | Use instead |
|---|---|---|
| `Instant.now()`, `LocalDateTime.now()`, `System.currentTimeMillis()`, `new Date()` | wall-clock time differs on replay | `ctx.getCurrentInstant()` |
| `UUID.randomUUID()` | a new value on every replay | `ctx.newUuid()` |
| `new Random()`, `Math.random()`, `ThreadLocalRandom` | non-deterministic | generate the value in an activity |
| `Thread.sleep(...)` | blocks without a history entry | `ctx.createTimer(Duration.ofMinutes(5)).await()` |
| `new Thread(...)`, executors, `CompletableFuture`, parallel streams | the runtime cannot replay them | `ctx.allOf(tasks).await()` over activity tasks |
| HTTP clients, JDBC, files, `System.getenv(...)` | I/O differs between runs and workers | an activity, or pass the value in the workflow input |
| Calls to Spring beans (repositories, services) | they do I/O | inject the bean into an activity |
| Static or instance fields that the body writes | the workflow bean is a singleton shared by every run | local variables, and activity outputs |
| `catch (Exception e)` / `catch (Throwable t)` around `.await()` | also catches the SDK's `OrchestratorBlockedException` | `catch (TaskFailedException e)` or `catch (TaskCanceledException e)` |
| Iterating a `HashSet` or `HashMap` to schedule tasks | iteration order is not guaranteed | a `List`, or sort first |

## Time

```java
// Wrong: a different value on every replay
Instant deadline = Instant.now().plus(Duration.ofDays(1));

// Right: the replay-safe time of the current run
Instant deadline = ctx.getCurrentInstant().plus(Duration.ofDays(1));
```

## Ids and random values

```java
// Wrong
String reference = UUID.randomUUID().toString();

// Right: deterministic per run and per call
String reference = ctx.newUuid().toString();
```

A random number belongs in an activity, whose result the history records.

## Waiting

```java
// Wrong: blocks the worker thread and records nothing
Thread.sleep(Duration.ofMinutes(5).toMillis());

// Right: a durable timer that survives a restart
ctx.createTimer(Duration.ofMinutes(5)).await();
```

## Parallel work

```java
// Wrong: threads and futures outside the runtime
CompletableFuture.supplyAsync(() -> resize(imageId));

// Right: schedule activities and wait for all of them
List<Task<ResizedImage>> tasks = imageIds.stream()
    .map(id -> ctx.callActivity(ResizeImageActivity.class.getName(), id, ResizedImage.class))
    .toList();
List<ResizedImage> resized = ctx.allOf(tasks).await();
```

## Catching exceptions

`.await()` on a task that has no result in the history yet stops the body by throwing
`io.dapr.durabletask.interruption.OrchestratorBlockedException`, a `RuntimeException`. The SDK's message says
it "should never be caught by user code". A broad `catch` swallows it and the workflow carries on as if the
call had returned. Catch the specific exceptions:

```java
try {
  result = ctx.callActivity(ChargeCardActivity.class.getName(), payment, ChargeResult.class).await();
} catch (TaskFailedException e) {   // the activity failed (after its retries)
  // compensate or complete with a failure result
}
```

`TaskCanceledException` is the one to catch around `waitForExternalEvent(name, timeout, type).await()`.

## Logging

Log from workflow code only through `ctx.getLogger()`. In the reference build it logged a workflow's start
line once per run although the body was replayed after each activity. An SLF4J logger of your own logs again
on every replay; guard it with `if (!ctx.isReplaying())` if you must use one.

## Loops

A bounded loop (over the input list, a retry counter) is fine. A loop that never ends grows the history with
every iteration. Handle one iteration per run and restart with `ctx.continueAsNew(nextInput)`, then `return`
(see the monitor pattern in [patterns.md](patterns.md)).

## Testing replay

The Java SDK has no replayer test helper. Cover replay with an integration test that restarts the app
mid-run and checks the run still completes (see [testing.md](testing.md)).
