# Reference: Review Dapr Workflow — Activities

This skill is read-only and operates entirely on existing source. The detailed rule tables live in the per-language checklist shards in `.claude/skills/dapr-shared/`.

## Source rule corpus

The canonical rule sources for this skill are the activity sections of the existing authoring skills:

- [`../dapr-shared/dotnet-activity-class.md`](../dapr-shared/dotnet-activity-class.md).
- [`../create-workflow-python/REFERENCE.md`](../create-workflow-python/REFERENCE.md) — section "Activity definition".

The per-language checklist shards translate those rules into greppable patterns and stable rule ids:

- [`../dapr-shared/review-activity-dotnet.md`](../dapr-shared/review-activity-dotnet.md)
- [`../dapr-shared/review-activity-python.md`](../dapr-shared/review-activity-python.md)

## Worked example

Given this .NET activity:

```csharp
internal sealed partial class ChargeCardActivity(
    ILogger<ChargeCardActivity> logger,
    IPaymentGateway gateway) : WorkflowActivity<ChargeInput, ChargeResult>
{
    public override async Task<ChargeResult> RunAsync(WorkflowActivityContext context, ChargeInput input)
    {
        try
        {
            var resp = await gateway.ChargeAsync(input.Amount, input.CardToken); // DWF-ACT-002 (no idempotency key)
            return new ChargeResult(true, resp.TransactionId);
        }
        catch (Exception)
        {
            return new ChargeResult(false, "");                                  // DWF-ACT-003 (swallowed)
        }
    }
}
```

The expected report excerpt:

```text
## Critical
- [DWF-ACT-002] `Activities/ChargeCardActivity.cs:9` — Payment gateway call has no idempotency key.
  Why: activities execute at least once (redelivery after a crash, retry-policy attempts); without a key the charge can run more than once.
  Fix: carry a stable key in `ChargeInput` (e.g. generated in the workflow with `context.NewGuid()`) and pass it to `ChargeAsync` as the idempotency key.

## Warnings
- [DWF-ACT-003] `Activities/ChargeCardActivity.cs:12` — `catch (Exception)` swallowed without rethrow or typed result
  Why: hides retries and silently turns a failure into a success.
  Fix: rethrow, or return a typed `ChargeResult` that distinguishes transient vs. terminal failures.
```

## Out of scope

- Workflow body code (`Workflow<>` `RunAsync`, `@wfr.workflow` functions) — covered by `review-workflow-determinism`.
- Management endpoints / `Program.cs` / `main.py` — covered by `review-workflow-management`.
- Versioning, error-handling policy, ops, and patterns — Phase 2 / 3 in `docs/review-skills-plan.md`.
