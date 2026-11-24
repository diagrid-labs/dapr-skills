package com.example.shiptrack.subscriber;

import io.dapr.Rule;
import io.dapr.Topic;
import io.dapr.client.domain.CloudEvent;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ShipmentEventsController {

  private final ShipmentDispatchedHandler handler;

  public ShipmentEventsController(ShipmentDispatchedHandler handler) {
    this.handler = handler;
  }

  @Topic(name = "${app.topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.dead-letter-topic}")
  @PostMapping("/events/pubsub/shipments")
  public ResponseEntity<TopicEventStatus> onShipmentDispatched(@RequestBody CloudEvent<ShipmentDispatched> event) {
    return ResponseEntity.ok(handler.handle(event.getData()));
  }

  @Topic(name = "${app.topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.dead-letter-topic}",
      rule = @Rule(match = "int(event.data.parcelCount) > 10", priority = 1))
  @PostMapping("/events/pubsub/shipments/bulk")
  public ResponseEntity<TopicEventStatus> onShipmentDispatchedBulk(@RequestBody CloudEvent<ShipmentDispatched> event) {
    return ResponseEntity.ok(handler.handle(event.getData()));
  }

  @Topic(name = "${app.dead-letter-topic}", pubsubName = "${dapr.pubsub.name}")
  @PostMapping("/events/pubsub/shipments-deadletter")
  public ResponseEntity<TopicEventStatus> onDeadLetter(@RequestBody CloudEvent<Object> event) {
    handler.handleDeadLetter(event.getId(), event.getData());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }
}
