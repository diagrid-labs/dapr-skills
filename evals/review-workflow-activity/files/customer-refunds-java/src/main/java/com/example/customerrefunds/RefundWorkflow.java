package com.example.customerrefunds;

import io.dapr.durabletask.TaskFailedException;
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import io.dapr.workflows.WorkflowTaskOptions;
import io.dapr.workflows.WorkflowTaskRetryPolicy;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class RefundWorkflow implements Workflow {

  private static final WorkflowTaskOptions RETRY = new WorkflowTaskOptions(
      WorkflowTaskRetryPolicy.newBuilder()
          .setMaxNumberOfAttempts(3)
          .setFirstRetryInterval(Duration.ofSeconds(1))
          .build());

  @Override
  public WorkflowStub create() {
    return ctx -> {
      RefundRequest request = ctx.getInput(RefundRequest.class);

      RefundResult refund;
      try {
        refund = ctx.callActivity(
            IssueRefundActivity.class.getName(), request, RETRY, RefundResult.class).await();
      } catch (TaskFailedException e) {
        ctx.callActivity(EscalateRefundActivity.class.getName(), request).await();
        ctx.complete(new RefundOutcome(request.refundId(), "ESCALATED"));
        return;
      }

      ctx.callActivity(
          RecordRefundActivity.class.getName(),
          new LedgerEntry(request.refundId(), request.amount(), refund.transactionId()),
          RETRY,
          LedgerReceipt.class).await();
      ctx.callActivity(AuditRefundActivity.class.getName(), request).await();
      ctx.callActivity(
          RefundActivities.NotifyCustomerActivity.class.getName(),
          new RefundReceipt(request.refundId(), request.customerEmail(), ctx.getCurrentInstant()),
          NotificationResult.class).await();
      ctx.callActivity(SendReceiptActivity.class.getName(), request, NotificationResult.class).await();

      ctx.complete(new RefundOutcome(request.refundId(), "REFUNDED"));
    };
  }
}
