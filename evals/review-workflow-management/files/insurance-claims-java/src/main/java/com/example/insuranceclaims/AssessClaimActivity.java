package com.example.insuranceclaims;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AssessClaimActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(AssessClaimActivity.class);

  @Override
  public Object run(WorkflowActivityContext ctx) {
    ClaimRequest input = ctx.getInput(ClaimRequest.class);
    logger.info("AssessClaimActivity: {}", input.claimId());
    return new ClaimAssessment(input.claimId(), input.amount() < 1000);
  }
}
