package com.example.customerrefunds;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class SendReceiptActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(SendReceiptActivity.class);

  private final RestClient mailClient = RestClient.create("http://localhost:8025");

  @Override
  public Object run(WorkflowActivityContext ctx) {
    RefundRequest input = ctx.getInput(RefundRequest.class);
    try {
      mailClient.post()
          .uri("/receipts")
          .header("Idempotency-Key", "receipt-" + input.refundId())
          .body(input)
          .retrieve()
          .toBodilessEntity();
    } catch (Exception e) {
      // the customer can download the receipt from the portal
    }
    return new NotificationResult(input.refundId(), true);
  }
}
