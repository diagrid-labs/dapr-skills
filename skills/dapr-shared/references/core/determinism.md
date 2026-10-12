# Determinism in Dapr Workflows

This document provides a conceptual overview of determinism in Dapr Workflows. Language-specific guidance is available at `references/{your_language}/determinism.md`.

## Overview

Dapr workflows must be deterministic because of **history replay** — the mechanism that enables durable execution and crash recovery.

## Why Determinism Matters — The Replay Mechanism

When the workflow engine needs to restore a workflow's state (after a crash, worker restart, or returning from a long timer), it **re-executes the workflow function from the beginning**. Instead of re-running external actions, it uses results already stored in the event history.

```
Initial Execution:
  Workflow code runs → Generates Actions → Stored as Events in history

Replay (Recovery):
  Workflow code runs again → Generates Actions → Engine compares to stored Events
    If match:    Use stored result, continue forward
    If mismatch: Non-determinism error — workflow is stuck
```

### How Replay Works Step-by-Step

```
┌─────────────────────────────────────────────────────────────────┐
│  First Execution                                                │
│                                                                 │
│  Workflow fn() → ctx.CallActivity("fetchData") ─────────────┐  │
│                                                              ↓  │
│                             Engine executes activity         │  │
│                             Result stored in history ←───────┘  │
│                             Action: ScheduleTaskAction           │
│                             Event:  TaskScheduledEvent           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Replay After Crash                                             │
│                                                                 │
│  Workflow fn() → ctx.CallActivity("fetchData") ─────────────┐  │
│                                                              ↓  │
│                          Engine sees TaskScheduledEvent exists  │
│                          Returns stored result immediately   ←──┘  │
│                          ctx.IsReplaying == true                │
└─────────────────────────────────────────────────────────────────┘
```

The `ctx.IsReplaying` field is set to `true` while the engine is processing old events, and `false` once it reaches new (unprocessed) events. This field is visible to workflow code and can be used for conditional logging or debugging.

## Actions and Events

Every workflow operation generates an Action that is stored as an Event in history. These must match exactly on replay.

| Workflow Code | Action Generated | Event Stored |
|---|---|---|
| `ctx.CallActivity(...)` | `ScheduleTaskAction` | `TaskScheduledEvent` |
| `ctx.CreateTimer(...)` | `CreateTimerAction` | `TimerCreatedEvent` |
| `ctx.CallChildWorkflow(...)` | `CreateSubOrchestrationAction` | `SubOrchestrationInstanceCreatedEvent` |
| Raise external event | `SendEventAction` | `EventRaisedEvent` |
| Complete workflow | `CompleteOrchestrationAction` | `ExecutionCompletedEvent` |

These names come directly from the `durabletask-go` protobuf definitions (`api/protos/orchestrator_service.pb.go`), which is the underlying engine Dapr Workflows uses.

## Non-Determinism Example

```
First Run (11:59 AM):
  if time.Now().Hour() < 12 → True
    ctx.CallActivity(ctx, morningTask)
    → Action: ScheduleTaskAction{Name: "morningTask"}

Replay (12:01 PM):
  if time.Now().Hour() < 12 → False
    ctx.CallActivity(ctx, afternoonTask)
    → Action: ScheduleTaskAction{Name: "afternoonTask"}

Result: Action name "afternoonTask" does not match stored Event
        "morningTask" → Non-determinism error, workflow stuck
```

The same failure mode applies to any code that produces a different result on re-execution: random numbers, environment variable reads, or branching based on external state.

## Sources of Non-Determinism

### Time-Based Operations

Direct time reads differ between the initial run and replay:

- Go: `time.Now()`
- .NET: `DateTime.UtcNow`, `DateTimeOffset.UtcNow`
- Python: `datetime.now()`, `time.time()`
- Java: `Instant.now()`, `LocalDateTime.now()`
- JavaScript: `Date.now()`, `new Date()`

Use `ctx.CurrentTimeUtc` (Go) or the SDK-equivalent property instead — it returns the timestamp from the history event, which is stable across replays.

### Random Values

- Go: `rand.Intn()`, `rand.Float64()`
- .NET: `Random.Shared.Next()`, `Guid.NewGuid()`
- Python: `random.random()`, `uuid.uuid4()`
- Java: `Math.random()`, `UUID.randomUUID()`
- JavaScript: `Math.random()`, `crypto.randomUUID()`

Move random value generation into activities so the result is recorded once and replayed.

### External State

Reading anything outside the workflow function that may change between executions:

- Files or environment variables
- In-memory global state or caches
- Database queries
- HTTP/gRPC calls

All external I/O belongs in activities, not in the workflow function itself.

### Non-Deterministic Iteration

In some languages, iteration order over unordered collections is not guaranteed:

- Go: `for k, v := range myMap` — map iteration order is randomized per run
- Python: sets (in older versions), dict (ordered since 3.7 but rely on insertion order, not sort order)
- Java: `HashMap`, `HashSet` — no guaranteed order

If workflow branching depends on which element is processed first, the result may differ on replay. Use sorted slices/lists or ordered maps when iteration order affects control flow.

### Threading and Goroutines

Workflow functions must not spawn goroutines or threads, as concurrent execution introduces race conditions whose ordering is non-deterministic:

- Go: `go func() { ... }()`
- .NET: `Task.Run(...)`, `new Thread(...)`
- Python: `threading.Thread(...)`
- Java: `new Thread(...)`, `CompletableFuture.supplyAsync(...)`

Dapr Workflow SDKs execute workflow functions cooperatively, not concurrently. All parallelism must be expressed using `ctx.WhenAll` / fan-out patterns — the engine handles scheduling.

## Central Concept: Place Non-Determinism Inside Activities

Activities are the correct location for all non-deterministic code. When an activity executes, its result is stored in the event history. On replay, the stored result is returned directly without re-executing the activity.

```
WRONG — non-determinism inside workflow:
  func MyWorkflow(ctx *workflow.WorkflowContext) (any, error) {
      id := uuid.NewString()              // different on every replay
      return ctx.CallActivity(ProcessOrder, id)
  }

CORRECT — non-determinism moved to activity:
  func MyWorkflow(ctx *workflow.WorkflowContext) (any, error) {
      var id string
      if err := ctx.CallActivity(GenerateID).Await(&id); err != nil {
          return nil, err
      }
      return ctx.CallActivity(ProcessOrder, id)
  }
```

For timestamps specifically, use the SDK-provided current time from context rather than calling the system clock directly. See `references/{your_language}/determinism.md` for language-specific safe alternatives.

## SDK Protection Mechanisms

**Dapr Workflow SDKs currently provide no sandbox or static analysis protection against non-determinism.**

This is a significant difference from some other workflow frameworks:

| Feature | Temporal Python | Temporal TypeScript | Temporal Go | Dapr (all SDKs) |
|---|---|---|---|---|
| Runtime sandbox | Yes | Yes (V8 isolate) | No | **No** |
| Static analysis tool | No | No | Beta | **No** |
| Safe time API | Yes | Yes | Yes | Partial (ctx only) |
| Non-determinism detected at | Execution | Execution | Replay | **Replay only** |

Because Dapr has no sandbox, non-determinism bugs are **silent until replay**. The workflow appears to run correctly on the first execution. The failure surfaces only when the workflow replays — after a crash, worker restart, or scale event. This delay between cause and symptom makes non-determinism bugs especially hard to diagnose.

The burden of correctness rests entirely on the developer. This makes the knowledge in this skill critical: there is no safety net.

## Detecting Non-Determinism

### At Replay Time

When the engine replays history and the generated action does not match the stored event, the workflow instance becomes blocked. Depending on the SDK and backend, you may see:

- A logged error indicating a mismatch between pending actions and expected events
- The workflow instance stuck in a `Running` state indefinitely
- Retry loops that never succeed

### Testing with Replay

The most reliable protection is to write replay tests that record a real execution history and then re-run it against the current workflow code. If the code produces different actions than what was recorded, the test fails. See `references/{your_language}/testing.md` for how to write replay tests in your language.

## Recovery from Non-Determinism

### Accidental Change

If non-determinism was introduced by mistake:

1. Revert the workflow code to match what was running when history was recorded
2. Restart the worker
3. The workflow will resume from where it left off

### Intentional Change

If you need to change workflow logic for running instances, use the **versioning (patching) API** to support both old and new code paths simultaneously. See `references/core/versioning.md` for details. Do not simply change the workflow code — doing so will corrupt history for in-flight instances.

## Best Practices

1. **Use context time** — read `ctx.CurrentTimeUtc` instead of calling the system clock
2. **Move all I/O to activities** — workflows orchestrate; activities act
3. **Avoid map/set iteration** in control flow that varies by element order
4. **No goroutines in workflows** — express parallelism via fan-out patterns
5. **Write replay tests** — the only reliable guard against non-determinism in Dapr
6. **Use versioning for changes** — never change logic that affects in-flight workflows without a patch
