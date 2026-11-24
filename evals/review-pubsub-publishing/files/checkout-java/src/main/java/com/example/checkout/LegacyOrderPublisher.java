package com.example.checkout;

import io.dapr.spring.messaging.DaprMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
public class LegacyOrderPublisher {

  private final DaprMessagingTemplate<OrderPlaced> orderTemplate;

  public LegacyOrderPublisher(DaprMessagingTemplate<OrderPlaced> orderTemplate) {
    this.orderTemplate = orderTemplate;
  }

  public void publish(OrderPlaced order) {
    orderTemplate.send("orders", order);
  }
}
