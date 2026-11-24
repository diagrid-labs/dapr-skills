package com.example.checkout;

import io.dapr.client.DaprClient;
import io.dapr.client.DaprClientBuilder;
import io.dapr.client.domain.BulkPublishResponse;
import io.dapr.exceptions.DaprException;
import io.dapr.spring.boot.properties.pubsub.DaprPubSubProperties;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CheckoutController {

  private static final Logger logger = LoggerFactory.getLogger(CheckoutController.class);

  private final DaprClient daprClient;
  private final DaprPubSubProperties pubSubProperties;
  private final String topic;

  public CheckoutController(
      DaprClient daprClient,
      DaprPubSubProperties pubSubProperties,
      @Value("${app.topic}") String topic) {
    this.daprClient = daprClient;
    this.pubSubProperties = pubSubProperties;
    this.topic = topic;
  }

  @PostMapping("/orders")
  public ResponseEntity<OrderPlaced> placeOrder(@RequestBody OrderPlaced order) {
    daprClient.publishEvent(pubSubProperties.getName(), topic, order).block();
    return ResponseEntity.accepted().body(order);
  }

  @PostMapping("/orders/fire-and-forget")
  public ResponseEntity<Void> placeOrderAndForget(@RequestBody OrderPlaced order) {
    daprClient.publishEvent(pubSubProperties.getName(), topic, order);
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/orders/quiet")
  public ResponseEntity<Void> placeOrderQuietly(@RequestBody OrderPlaced order) {
    try {
      daprClient.publishEvent(pubSubProperties.getName(), topic, order).block();
    } catch (DaprException e) {
    }
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/orders/safe")
  public ResponseEntity<Void> placeOrderSafely(@RequestBody OrderPlaced order) {
    try {
      daprClient.publishEvent(pubSubProperties.getName(), topic, order).block();
    } catch (DaprException e) {
      logger.error("Publishing order {} failed", order.orderId(), e);
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/orders/legacy-bus")
  public ResponseEntity<Void> placeOrderOnLegacyBus(@RequestBody OrderPlaced order) {
    daprClient.publishEvent("order-bus", "orders", order).block();
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/orders/batch")
  public ResponseEntity<Void> placeOrderBatch(@RequestBody List<OrderPlaced> orders) {
    daprClient.publishEvent(pubSubProperties.getName(), topic, orders).block();
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/orders/bulk")
  public ResponseEntity<Void> placeOrdersInBulk(@RequestBody List<OrderPlaced> orders) {
    BulkPublishResponse<OrderPlaced> response = daprClient
        .publishEvents(pubSubProperties.getName(), topic, "application/json", orders)
        .block();
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/orders/traced")
  public ResponseEntity<Void> placeTracedOrder(
      @RequestBody OrderPlaced order, @RequestHeader("traceparent") String traceparent) {
    daprClient.publishEvent(pubSubProperties.getName(), topic, order,
        Map.of("cloudevent.traceparent", traceparent)).block();
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/orders/raw")
  public ResponseEntity<Void> placeRawOrder(@RequestBody OrderPlaced order) {
    daprClient.publishEvent(pubSubProperties.getName(), topic, order, Map.of("rawPayload", "true")).block();
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/orders/audit")
  public ResponseEntity<Void> auditOrder(@RequestBody OrderPlaced order) {
    DaprClient auditClient = new DaprClientBuilder().build();
    auditClient.publishEvent(pubSubProperties.getName(), "order-audit", order).block();
    return ResponseEntity.accepted().build();
  }
}
