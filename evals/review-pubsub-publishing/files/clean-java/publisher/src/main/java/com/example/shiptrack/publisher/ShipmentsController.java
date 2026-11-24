package com.example.shiptrack.publisher;

import io.dapr.client.DaprClient;
import io.dapr.spring.boot.properties.pubsub.DaprPubSubProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ShipmentsController {

  private final DaprClient daprClient;
  private final DaprPubSubProperties pubSubProperties;
  private final String topic;

  public ShipmentsController(
      DaprClient daprClient,
      DaprPubSubProperties pubSubProperties,
      @Value("${app.topic}") String topic) {
    this.daprClient = daprClient;
    this.pubSubProperties = pubSubProperties;
    this.topic = topic;
  }

  @PostMapping("/shipments")
  public ResponseEntity<ShipmentDispatched> publish(@RequestBody ShipmentDispatched shipmentDispatched) {
    daprClient.publishEvent(pubSubProperties.getName(), topic, shipmentDispatched).block();
    return ResponseEntity.accepted().body(shipmentDispatched);
  }
}
