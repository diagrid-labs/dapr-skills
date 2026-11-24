package com.example.insuranceclaims;

import io.dapr.durabletask.TaskCanceledException;
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class ClaimWorkflow implements Workflow {

  public static final String ADJUSTER_DECISION_EVENT = "AdjusterDecision";

  @Override
  public WorkflowStub create() {
    return ctx -> {
      ClaimRequest claim = ctx.getInput(ClaimRequest.class);
      ClaimAssessment assessment = ctx.callActivity(
          AssessClaimActivity.class.getName(), claim, ClaimAssessment.class).await();

      if (assessment.autoApproved()) {
        ctx.callActivity(PayClaimActivity.class.getName(), claim, ClaimPayment.class).await();
        ctx.complete(new ClaimResult(claim.claimId(), "PAID"));
        return;
      }

      AdjusterDecision decision;
      try {
        decision = ctx.waitForExternalEvent(
            ADJUSTER_DECISION_EVENT, Duration.ofDays(3), AdjusterDecision.class).await();
      } catch (TaskCanceledException e) {
        ctx.complete(new ClaimResult(claim.claimId(), "ADJUSTER_TIMED_OUT"));
        return;
      }

      if (!decision.approved()) {
        ctx.complete(new ClaimResult(claim.claimId(), "DENIED"));
        return;
      }
      ctx.callActivity(PayClaimActivity.class.getName(), claim, ClaimPayment.class).await();
      ctx.complete(new ClaimResult(claim.claimId(), "PAID"));
    };
  }
}
