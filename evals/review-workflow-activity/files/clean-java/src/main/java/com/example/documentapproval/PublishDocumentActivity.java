package com.example.documentapproval;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class PublishDocumentActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(PublishDocumentActivity.class);

  @Override
  public Object run(WorkflowActivityContext ctx) {
    ApprovalRequest input = ctx.getInput(ApprovalRequest.class);
    logger.info("PublishDocumentActivity: {}", input.documentId());

    // TODO: implement actual functionality

    return new DocumentPublished(input.documentId());
  }
}
