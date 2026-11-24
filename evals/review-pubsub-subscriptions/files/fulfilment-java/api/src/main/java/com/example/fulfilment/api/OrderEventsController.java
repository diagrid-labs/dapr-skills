package com.example.fulfilment.api;

import io.dapr.Rule;
import io.dapr.Topic;
import io.dapr.client.domain.CloudEvent;
import java.util.Currency;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/events/pubsub")
public class OrderEventsController {

  private static final Logger logger = LoggerFactory.getLogger(OrderEventsController.class);

  private final OrderBook orderBook;

  public OrderEventsController(OrderBook orderBook) {
    this.orderBook = orderBook;
  }

  @Topic(name = "${app.orders-topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.orders-dead-letter-topic}")
  @PostMapping("/orders")
  public ResponseEntity<TopicEventStatus> onOrder(@RequestBody OrderPlaced order) {
    logger.info("Order {} for customer {} with {} items", order.orderId(), order.customerId(), order.itemCount());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }

  @Topic(name = "${app.orders-dead-letter-topic}", pubsubName = "${dapr.pubsub.name}")
  @PostMapping("/orders-deadletter")
  public ResponseEntity<TopicEventStatus> onOrderDeadLetter(@RequestBody CloudEvent<Object> event) {
    logger.error("Dead-lettered order event {}: {}", event.getId(), event.getData());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }

  @Topic(name = "refunds", pubsubName = "${dapr.pubsub.name}")
  @PostMapping("/refunds")
  public ResponseEntity<TopicEventStatus> onRefund(@RequestBody CloudEvent<RefundRequested> event) {
    RefundRequested refund = event.getData();
    if (refund == null || refund.amountCents() <= 0) {
      return ResponseEntity.ok(TopicEventStatus.RETRY);
    }
    if (!orderBook.exists(refund.orderId())) {
      return ResponseEntity.notFound().build();
    }
    logger.info("Refund {} of {} cents for order {}", refund.refundId(), refund.amountCents(), refund.orderId());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }

  @Topic(name = "${app.payments-topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.payments-dead-letter-topic}",
      rule = @Rule(match = "event.data.amount > 1000", priority = 1))
  @PostMapping("/payments/large")
  public ResponseEntity<TopicEventStatus> onLargePayment(@RequestBody CloudEvent<PaymentReceived> event) {
    PaymentReceived payment = event.getData();
    try {
      Currency currency = Currency.getInstance(payment.currency());
      logger.info("Large payment {} of {} {} for review", payment.paymentId(), payment.amount(), currency);
    } catch (IllegalArgumentException e) {
      logger.warn("Payment {} has an unknown currency {}", payment.paymentId(), payment.currency());
      return ResponseEntity.ok(TopicEventStatus.SUCCESS);
    }
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }

  @Topic(name = "${app.payments-topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.payments-dead-letter-topic}")
  @PostMapping("/payments")
  public ResponseEntity<TopicEventStatus> onPayment(@RequestBody CloudEvent<PaymentReceived> event) {
    logger.info("Payment {} for order {}", event.getData().paymentId(), event.getData().orderId());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }

  @Topic(name = "${app.payments-dead-letter-topic}", pubsubName = "${dapr.pubsub.name}")
  @PostMapping("/payments-deadletter")
  public ResponseEntity<TopicEventStatus> onPaymentDeadLetter(@RequestBody CloudEvent<Object> event) {
    logger.error("Dead-lettered payment event {}: {}", event.getId(), event.getData());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }
}
