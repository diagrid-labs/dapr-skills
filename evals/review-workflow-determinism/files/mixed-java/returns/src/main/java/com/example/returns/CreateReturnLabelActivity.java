package com.example.returns;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class CreateReturnLabelActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(CreateReturnLabelActivity.class);

  @Override
  public Object run(WorkflowActivityContext ctx) {
    ReturnLabel label = ctx.getInput(ReturnLabel.class);
    logger.info("Creating return label {} for order {}", label.labelId(), label.orderId());
    return label;
  }
}
