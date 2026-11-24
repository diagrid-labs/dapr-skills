package com.example.insuranceclaims;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class PayClaimActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(PayClaimActivity.class);

  @Override
  public Object run(WorkflowActivityContext ctx) {
    ClaimRequest input = ctx.getInput(ClaimRequest.class);
    logger.info("PayClaimActivity: {}", input.claimId());
    return new ClaimPayment(input.claimId(), input.amount());
  }
}
