# Java SDK Error Handling

## Overview

An exception thrown from an activity's `run` method fails that activity. The workflow sees the failure when it
calls `.await()` on the activity's task: `await()` throws `io.dapr.durabletask.TaskFailedException`. A retry
policy on the call makes the runtime try the activity again first; only when the attempts are used up does
the workflow get the exception. An uncaught exception in the workflow body fails the run (`FAILED`).

The error taxonomy for every SDK: [core/error-reference.md](../core/error-reference.md).

## Retry policies

Pass a `WorkflowTaskOptions` holding a `WorkflowTaskRetryPolicy` to `callActivity` for every activity that can
fail transiently (a remote call, a database write). Declare it once as a constant:

```java
import io.dapr.workflows.WorkflowTaskOptions;
import io.dapr.workflows.WorkflowTaskRetryPolicy;
import java.time.Duration;

private static final WorkflowTaskOptions RETRY = new WorkflowTaskOptions(
    WorkflowTaskRetryPolicy.newBuilder()
        .setMaxNumberOfAttempts(3)
        .setFirstRetryInterval(Duration.ofSeconds(1))
        .setBackoffCoefficient(2.0)
        .setMaxRetryInterval(Duration.ofSeconds(10))
        .build());

ChargeResult charge = ctx.callActivity(
    ChargeCardActivity.class.getName(), payment, RETRY, ChargeResult.class).await();
```

| Builder method | Meaning |
|---|---|
| `setMaxNumberOfAttempts(int)` | total attempts, including the first |
| `setFirstRetryInterval(Duration)` | wait before the first retry |
| `setBackoffCoefficient(double)` | multiplier applied to the wait after each retry |
| `setMaxRetryInterval(Duration)` | upper bound for the wait |
| `setRetryTimeout(Duration)` | stop retrying after this much time in total |

In the reference build a policy like this retried an activity whose first call threw, and the second attempt
succeeded ([gotchas.md](gotchas.md) §7). The retries are durable: they survive an app restart.

The same options work for child workflows:
`ctx.callChildWorkflow(name, input, instanceId, RETRY, ResultType.class)`.

## Catching a failed activity

```java
try {
  ChargeResult charge = ctx.callActivity(
      ChargeCardActivity.class.getName(), payment, RETRY, ChargeResult.class).await();
  ctx.complete(new PaymentOutcome(payment.paymentId(), "CHARGED"));
} catch (TaskFailedException e) {
  ctx.getLogger().warn("Charging {} failed: {} {}", payment.paymentId(),
      e.getErrorDetails().getErrorType(), e.getErrorDetails().getErrorMessage());
  ctx.complete(new PaymentOutcome(payment.paymentId(), "FAILED"));
}
```

- `e.getTaskName()` is the activity name; `e.getErrorDetails()` holds the original exception's type, message
  and stack trace.
- `e.getErrorDetails().isCausedBy(IllegalArgumentException.class)` tests the original exception type.
- **Never** `catch (Exception e)` or `catch (Throwable t)` around `.await()`. `await()` stops the body by
  throwing `OrchestratorBlockedException` while it waits for a result, and a broad catch swallows it.

## Failures from fan-out

`ctx.allOf(tasks).await()` throws a `CompositeTaskFailedException` when one or more of the tasks failed, after
all of them have finished. `getExceptions()` lists each `TaskFailedException`.

## Timeouts are not failures

`waitForExternalEvent(name, timeout, type).await()` throws `TaskCanceledException` when the timeout expires.
Catch it and complete with a timed-out result (see the human-in-the-loop pattern in
[patterns.md](patterns.md)).

## Errors that retrying cannot fix

A retry policy retries every exception. For input that can never succeed (a validation error), either
validate in the controller before scheduling the workflow, or let the activity return a result that says
"rejected" instead of throwing, so the workflow can branch on it without burning retries.

## Workflow-level failure

An exception that escapes the `WorkflowStub` ends the run as `FAILED`. `getWorkflowState(id, true)` then
returns the failure in `getFailureDetails()` (`getErrorType()`, `getErrorMessage()`). Prefer completing with a
failure result over failing the run, so callers read a typed outcome from `/status`.

## Compensation

Undo completed steps when a later step fails, in reverse order, and complete with a result instead of
rethrowing. Full example: the saga pattern in [patterns.md](patterns.md).

## Activity idempotency

An activity can run more than once: after a retry, or when the app stops after the activity ran but before its
result was recorded. Make side effects idempotent: use the workflow instance id or an input id as the
idempotency key for remote calls, and upsert rather than insert.
