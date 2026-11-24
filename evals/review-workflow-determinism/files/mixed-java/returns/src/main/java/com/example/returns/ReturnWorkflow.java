package com.example.returns;

import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class ReturnWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      ReturnRequest request = ctx.getInput(ReturnRequest.class);
      String labelId = UUID.randomUUID().toString();
      ReturnLabel label = ctx.callActivity(
          CreateReturnLabelActivity.class.getName(),
          new ReturnLabel(request.orderId(), labelId),
          ReturnLabel.class).await();
      ctx.complete(label);
    };
  }
}
