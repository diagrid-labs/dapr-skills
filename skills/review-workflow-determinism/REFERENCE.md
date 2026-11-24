# Reference: Review Dapr Workflow — Determinism

This skill is read-only and operates entirely on existing source. The detailed rule tables live in the per-language checklist shards in [`../dapr-shared/`](../dapr-shared/).

## Source rule corpus

The canonical rule sources for this skill are the dedicated determinism references, then the determinism sections of the authoring skills:

- [`../dapr-shared/references/core/determinism.md`](../dapr-shared/references/core/determinism.md) — the replay mechanism and why each hazard breaks it.
- [`../dapr-shared/references/dotnet/determinism.md`](../dapr-shared/references/dotnet/determinism.md) — the .NET rules.
- [`../dapr-shared/references/python/determinism.md`](../dapr-shared/references/python/determinism.md) — the Python rules.
- [`../dapr-shared/references/java/determinism.md`](../dapr-shared/references/java/determinism.md) — the Java rules.
- [`../dapr-shared/references/core/gotchas.md`](../dapr-shared/references/core/gotchas.md) — symptoms a finding should name.
- [`../dapr-shared/references/core/troubleshooting.md`](../dapr-shared/references/core/troubleshooting.md) — how a stuck run presents.

- [`../dapr-shared/dotnet-workflow-class.md`](../dapr-shared/dotnet-workflow-class.md) — section "Workflow determinism".
- [`../create-workflow-python/REFERENCE.md`](../create-workflow-python/REFERENCE.md) — section "Workflow determinism".
- [`../dapr-shared/java-workflow-class.md`](../dapr-shared/java-workflow-class.md) — section "Workflow determinism".

The per-language checklist shards translate those rules into greppable patterns and stable rule ids:

- [`../dapr-shared/review-determinism-dotnet.md`](../dapr-shared/review-determinism-dotnet.md)
- [`../dapr-shared/review-determinism-python.md`](../dapr-shared/review-determinism-python.md)
- [`../dapr-shared/review-determinism-java.md`](../dapr-shared/review-determinism-java.md)

## Worked example

Given this .NET workflow:

```csharp
internal sealed class OrderWorkflow : Workflow<OrderInput, OrderResult>
{
    public override async Task<OrderResult> RunAsync(WorkflowContext context, OrderInput input)
    {
        var startedAt = DateTime.UtcNow;                     // DWF-DET-001
        var correlationId = Guid.NewGuid();                  // DWF-DET-002
        using var http = new HttpClient();                   // DWF-DET-006
        var resp = await http.GetStringAsync(input.LookupUrl); // I/O in workflow scope

        return await context.CallActivityAsync<OrderResult>(nameof(ProcessOrderActivity), input);
    }
}
```

The expected report excerpt:

```text
## Critical
- [DWF-DET-001] `Workflows/OrderWorkflow.cs:5` — `DateTime.UtcNow` used inside RunAsync
  Why: non-deterministic, breaks replay.
  Fix: use `context.CurrentUtcDateTime`.
- [DWF-DET-002] `Workflows/OrderWorkflow.cs:6` — `Guid.NewGuid()` used inside RunAsync
  Why: produces a different value on each replay.
  Fix: use `context.NewGuid()`.
- [DWF-DET-006] `Workflows/OrderWorkflow.cs:7` — `HttpClient` constructed inside RunAsync
  Why: direct I/O inside a workflow runs once per replay.
  Fix: move the call into an activity invoked via `context.CallActivityAsync`.
```

## Java worked example

Given this Java workflow, where a broad `catch` wraps an `.await()`:

```java
@Component
public class PaymentWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      PaymentRequest payment = ctx.getInput(PaymentRequest.class);
      try {
        ChargeResult charge = ctx.callActivity(
            ChargeCardActivity.class.getName(), payment, ChargeResult.class).await();
        ctx.complete(new PaymentOutcome(payment.paymentId(), "CHARGED"));
      } catch (Exception e) {                                   // DWF-DET-016
        ctx.complete(new PaymentOutcome(payment.paymentId(), "FAILED"));
      }
    };
  }
}
```

The expected report excerpt:

```text
## Critical
- [DWF-DET-016] `PaymentWorkflow.java:12` — `catch (Exception e)` around `.await()` in the workflow body
  Why: it swallows the SDK's OrchestratorBlockedException, so the run completes FAILED before the charge returns.
  Fix: catch `TaskFailedException` (and `TaskCanceledException` for event timeouts) instead.
```

## Out of scope

- Activity bodies — covered by `review-workflow-activity`.
- Management endpoints / `Program.cs` / `main.py` / the `@RestController` — covered by `review-workflow-management`.
- Workflow versioning (`IsPatched` / `is_patched` and named workflow versions), error-handling policy, operations, and pattern-level design reviews — not covered by the review skills.
