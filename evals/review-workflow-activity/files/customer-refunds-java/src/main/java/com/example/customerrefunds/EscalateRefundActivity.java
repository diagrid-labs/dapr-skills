package com.example.customerrefunds;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import io.dapr.workflows.client.DaprWorkflowClient;
import org.springframework.stereotype.Component;

@Component
public class EscalateRefundActivity implements WorkflowActivity {

  private final DaprWorkflowClient workflowClient;

  public EscalateRefundActivity(DaprWorkflowClient workflowClient) {
    this.workflowClient = workflowClient;
  }

  @Override
  public Object run(WorkflowActivityContext ctx) {
    RefundRequest input = ctx.getInput(RefundRequest.class);
    workflowClient.scheduleNewWorkflow(RefundWorkflow.class, input, input.refundId() + "-retry");
    return null;
  }
}
