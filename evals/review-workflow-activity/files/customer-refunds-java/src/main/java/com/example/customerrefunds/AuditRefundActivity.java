package com.example.customerrefunds;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AuditRefundActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(AuditRefundActivity.class);

  @Override
  public Object run(WorkflowActivityContext ctx) {
    RefundRequest input = ctx.getInput(RefundRequest.class);
    logger.info("Audit: refund {} of {} requested", input.refundId(), input.amount());
    return null;
  }
}
