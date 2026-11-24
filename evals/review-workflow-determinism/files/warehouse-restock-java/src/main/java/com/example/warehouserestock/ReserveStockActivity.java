package com.example.warehouserestock;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class ReserveStockActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(ReserveStockActivity.class);

  private final InventoryService inventoryService;

  public ReserveStockActivity(InventoryService inventoryService) {
    this.inventoryService = inventoryService;
  }

  @Override
  public Object run(WorkflowActivityContext ctx) {
    ReservationRequest input = ctx.getInput(ReservationRequest.class);
    String reservationId = inventoryService.reserve(input.sku(), input.quantity()) + "-" + UUID.randomUUID();
    logger.info("Reserved {} at {}", reservationId, Instant.now());
    return new StockReservation(reservationId);
  }
}
