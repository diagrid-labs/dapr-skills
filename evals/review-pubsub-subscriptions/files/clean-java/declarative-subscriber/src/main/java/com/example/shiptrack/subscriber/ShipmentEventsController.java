package com.example.shiptrack.subscriber;

import io.dapr.client.domain.CloudEvent;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Routes are wired by resources/subscription.yaml; no @Topic here. */
@RestController
public class ShipmentEventsController {

  private final ShipmentDispatchedHandler handler;

  public ShipmentEventsController(ShipmentDispatchedHandler handler) {
    this.handler = handler;
  }

  @PostMapping("/events/pubsub/shipments")
  public ResponseEntity<TopicEventStatus> onShipmentDispatched(@RequestBody CloudEvent<ShipmentDispatched> event) {
    return ResponseEntity.ok(handler.handle(event.getData()));
  }

  @PostMapping("/events/pubsub/shipments/bulk")
  public ResponseEntity<TopicEventStatus> onShipmentDispatchedBulk(@RequestBody CloudEvent<ShipmentDispatched> event) {
    return ResponseEntity.ok(handler.handle(event.getData()));
  }

  @PostMapping("/events/pubsub/shipments-deadletter")
  public ResponseEntity<TopicEventStatus> onDeadLetter(@RequestBody CloudEvent<Object> event) {
    handler.handleDeadLetter(event.getId(), event.getData());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }
}
