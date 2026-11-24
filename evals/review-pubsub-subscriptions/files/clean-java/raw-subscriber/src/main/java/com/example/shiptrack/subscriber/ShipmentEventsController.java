package com.example.shiptrack.subscriber;

import io.dapr.Topic;
import io.dapr.client.domain.CloudEvent;
import java.nio.charset.StandardCharsets;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@RestController
public class ShipmentEventsController {

  private final ShipmentDispatchedHandler handler;
  private final JsonMapper jsonMapper;

  public ShipmentEventsController(ShipmentDispatchedHandler handler, JsonMapper jsonMapper) {
    this.handler = handler;
    this.jsonMapper = jsonMapper;
  }

  @Topic(name = "${app.topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.dead-letter-topic}", metadata = "{\"rawPayload\": \"true\"}")
  @PostMapping("/events/pubsub/shipments-raw")
  public ResponseEntity<TopicEventStatus> onShipmentDispatched(@RequestBody CloudEvent<ShipmentDispatched> event) {
    ShipmentDispatched shipmentDispatched;
    try {
      shipmentDispatched = jsonMapper.readValue(event.getBinaryData(), ShipmentDispatched.class);
    } catch (JacksonException e) {
      return ResponseEntity.ok(TopicEventStatus.DROP);
    }
    return ResponseEntity.ok(handler.handle(shipmentDispatched));
  }

  @Topic(name = "${app.dead-letter-topic}", pubsubName = "${dapr.pubsub.name}",
      metadata = "{\"rawPayload\": \"true\"}")
  @PostMapping("/events/pubsub/shipments-raw-deadletter")
  public ResponseEntity<TopicEventStatus> onDeadLetter(@RequestBody CloudEvent<Object> event) {
    handler.handleDeadLetter(event.getId(), new String(event.getBinaryData(), StandardCharsets.UTF_8));
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }
}
