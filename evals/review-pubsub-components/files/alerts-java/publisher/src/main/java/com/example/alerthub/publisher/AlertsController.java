package com.example.alerthub.publisher;

import io.dapr.client.DaprClient;
import io.dapr.spring.boot.properties.pubsub.DaprPubSubProperties;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AlertsController {

  private final DaprClient daprClient;
  private final DaprPubSubProperties pubSubProperties;
  private final String topic;

  public AlertsController(
      DaprClient daprClient,
      DaprPubSubProperties pubSubProperties,
      @Value("${app.topic}") String topic) {
    this.daprClient = daprClient;
    this.pubSubProperties = pubSubProperties;
    this.topic = topic;
  }

  @PostMapping("/alerts")
  public ResponseEntity<AlertRaised> publish(@RequestBody AlertRaised alertRaised) {
    daprClient.publishEvent(pubSubProperties.getName(), topic, alertRaised, Map.of("rawPayload", "true")).block();
    return ResponseEntity.accepted().body(alertRaised);
  }
}
