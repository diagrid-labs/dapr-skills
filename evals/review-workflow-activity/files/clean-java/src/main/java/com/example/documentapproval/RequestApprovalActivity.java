package com.example.documentapproval;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class RequestApprovalActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(RequestApprovalActivity.class);

  @Override
  public Object run(WorkflowActivityContext ctx) {
    ApprovalRequest input = ctx.getInput(ApprovalRequest.class);
    logger.info("RequestApprovalActivity: {}", input.documentId());

    // TODO: implement actual functionality

    return new ApprovalRequested(input.documentId(), input.author());
  }
}
