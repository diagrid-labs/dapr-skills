package com.example.documentapproval;

import io.dapr.durabletask.TaskCanceledException;
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class DocumentApprovalWorkflow implements Workflow {

  public static final String APPROVAL_EVENT = "ApprovalDecision";

  @Override
  public WorkflowStub create() {
    return ctx -> {
      ApprovalRequest request = ctx.getInput(ApprovalRequest.class);
      ctx.getLogger().info("DocumentApprovalWorkflow {} started", ctx.getInstanceId());

      ApprovalRequested requested = ctx.callActivity(
          RequestApprovalActivity.class.getName(), request, ApprovalRequested.class).await();

      ApprovalDecision decision;
      try {
        decision = ctx.waitForExternalEvent(
            APPROVAL_EVENT, Duration.ofDays(1), ApprovalDecision.class).await();
      } catch (TaskCanceledException e) {
        ctx.getLogger().warn("No approval decision for document {} within 1 day", requested.documentId());
        ctx.complete(new ApprovalResult(request.documentId(), "TIMED_OUT"));
        return;
      }

      if (!decision.approved()) {
        ctx.complete(new ApprovalResult(request.documentId(), "REJECTED by " + decision.approver()));
        return;
      }

      DocumentPublished published = ctx.callActivity(
          PublishDocumentActivity.class.getName(), request, DocumentPublished.class).await();

      ctx.complete(new ApprovalResult(published.documentId(), "PUBLISHED"));
    };
  }
}
