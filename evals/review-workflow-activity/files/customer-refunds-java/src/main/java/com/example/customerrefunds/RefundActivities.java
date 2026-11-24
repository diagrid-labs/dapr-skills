package com.example.customerrefunds;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.springframework.stereotype.Component;

public class RefundActivities {

  @Component
  public static class NotifyCustomerActivity implements WorkflowActivity {

    private static int notificationsSent;

    @Override
    public Object run(WorkflowActivityContext ctx) {
      RefundReceipt input = ctx.getInput(RefundReceipt.class);
      notificationsSent++;
      System.out.println("Notifying " + input.customerEmail() + " about refund " + input.refundId());
      return new NotificationResult(input.refundId(), true);
    }
  }
}
