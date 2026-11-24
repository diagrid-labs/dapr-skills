package com.example.documentapproval;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class ProcessDocumentActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(ProcessDocumentActivity.class);

  @Override
  public Object run(WorkflowActivityContext ctx) {
    ProcessDocumentInput input = ctx.getInput(ProcessDocumentInput.class);
    logger.info("ProcessDocumentActivity: {}", input.data());

    // TODO: implement actual functionality

    return new ProcessDocumentOutput("Processed: " + input.data());
  }
}
