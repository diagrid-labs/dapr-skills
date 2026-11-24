package com.example.warehouserestock;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.springframework.stereotype.Component;

@Component
public class CheckStockLevelActivity implements WorkflowActivity {

  private final InventoryService inventoryService;

  public CheckStockLevelActivity(InventoryService inventoryService) {
    this.inventoryService = inventoryService;
  }

  @Override
  public Object run(WorkflowActivityContext ctx) {
    StockMonitorInput input = ctx.getInput(StockMonitorInput.class);
    return new StockLevel(input.sku(), inventoryService.currentLevel(input.sku()));
  }
}
