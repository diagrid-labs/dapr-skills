package com.example.customerrefunds;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class RecordRefundActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(RecordRefundActivity.class);

  private final RestClient ledgerClient;

  public RecordRefundActivity(PaymentGatewayProperties gateway) {
    this.ledgerClient = RestClient.create(gateway.ledgerUrl());
  }

  @Override
  public Object run(WorkflowActivityContext ctx) {
    LedgerEntry input = ctx.getInput(LedgerEntry.class);
    try {
      return ledgerClient.put()
          .uri("/entries/{refundId}", input.refundId())
          .header("Idempotency-Key", input.refundId())
          .body(input)
          .retrieve()
          .body(LedgerReceipt.class);
    } catch (RestClientException e) {
      logger.error("Recording refund {} failed", input.refundId(), e);
      throw e;
    }
  }
}
