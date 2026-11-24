package com.example.warehouserestock;

import io.dapr.durabletask.TaskFailedException;
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class RestockWorkflow implements Workflow {

  private static final Logger logger = LoggerFactory.getLogger(RestockWorkflow.class);

  private final InventoryService inventoryService;
  private int restocksStarted;

  public RestockWorkflow(InventoryService inventoryService) {
    this.inventoryService = inventoryService;
  }

  @Override
  public WorkflowStub create() {
    return ctx -> {
      RestockRequest request = ctx.getInput(RestockRequest.class);
      ctx.getLogger().info("Restock {} started for {}", ctx.getInstanceId(), request.sku());

      Instant receivedAt = ctx.getCurrentInstant();
      Instant deliverBy = Instant.now().plus(Duration.ofDays(2));
      String purchaseOrderId = UUID.randomUUID().toString();
      String supplierRegion = System.getenv("SUPPLIER_REGION");

      logger.info("Restocking {} from region {}", request.sku(), supplierRegion);
      restocksStarted++;

      int onHand = inventoryService.currentLevel(request.sku());

      StockReservation reservation;
      try {
        reservation = ctx.callActivity(
            ReserveStockActivity.class.getName(),
            new ReservationRequest(request.sku(), request.quantity()),
            StockReservation.class).await();
      } catch (Exception e) {
        ctx.getLogger().warn("Reserving stock for {} failed", request.sku());
        ctx.complete(new RestockResult(request.sku(), null, "RESERVATION_FAILED", receivedAt));
        return;
      }

      // Give the warehouse system a moment to settle before ordering from the supplier.
      try {
        Thread.sleep(30_000);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }

      SupplierOrder order = null;
      for (int attempt = 1; attempt <= 3 && order == null; attempt++) {
        try {
          order = ctx.callActivity(
              PlaceSupplierOrderActivity.class.getName(),
              new SupplierOrderRequest(purchaseOrderId, request.sku(), request.quantity() - onHand, deliverBy),
              SupplierOrder.class).await();
        } catch (TaskFailedException e) {
          ctx.getLogger().warn("Supplier order for {} failed on attempt {}", request.sku(), attempt);
          ctx.createTimer(Duration.ofSeconds(10L * attempt)).await();
        }
      }

      String status = order == null ? "SUPPLIER_FAILED" : "ORDERED";
      ctx.complete(new RestockResult(request.sku(), reservation.reservationId(), status, receivedAt));
    };
  }
}
