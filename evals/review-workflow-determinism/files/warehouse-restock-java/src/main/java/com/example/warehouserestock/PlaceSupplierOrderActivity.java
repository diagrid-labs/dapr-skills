package com.example.warehouserestock;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class PlaceSupplierOrderActivity implements WorkflowActivity {

  private final RestClient restClient = RestClient.create();

  @Override
  public Object run(WorkflowActivityContext ctx) {
    SupplierOrderRequest input = ctx.getInput(SupplierOrderRequest.class);
    String supplierUrl = System.getenv().getOrDefault("SUPPLIER_URL", "http://localhost:9090");
    SupplierOrder order = restClient.post()
        .uri(supplierUrl + "/orders")
        .header("Idempotency-Key", input.purchaseOrderId())
        .body(input)
        .retrieve()
        .body(SupplierOrder.class);
    return order;
  }
}
