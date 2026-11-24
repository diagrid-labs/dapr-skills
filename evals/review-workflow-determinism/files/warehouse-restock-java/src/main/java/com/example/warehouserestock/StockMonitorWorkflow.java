package com.example.warehouserestock;

import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class StockMonitorWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      StockMonitorInput input = ctx.getInput(StockMonitorInput.class);

      while (true) {
        StockLevel level = ctx.callActivity(
            CheckStockLevelActivity.class.getName(), input, StockLevel.class).await();
        if (level.onHand() < input.threshold()) {
          ctx.getLogger().info("Stock of {} is below {}", input.sku(), input.threshold());
        }
        ctx.createTimer(Duration.ofMinutes(15)).await();
      }
    };
  }
}
