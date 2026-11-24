package com.example.customerrefunds;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class IssueRefundActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(IssueRefundActivity.class);

  @Autowired
  private PaymentGatewayProperties gateway;

  private final RestClient restClient = RestClient.create();

  @Override
  public Object run(WorkflowActivityContext ctx) {
    RefundRequest input = ctx.getInput(RefundRequest.class);
    logger.info("Refunding {} for {}", input.amount(), input.refundId());
    RefundResult result = restClient.post()
        .uri(gateway.baseUrl() + "/refunds")
        .body(new GatewayRefund(input.paymentId(), input.amount()))
        .retrieve()
        .body(RefundResult.class);
    return result;
  }
}
