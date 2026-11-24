package com.example.alerthub.subscriber;

import io.dapr.Topic;
import io.dapr.client.domain.CloudEvent;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@RestController
public class AlertEventsController {

  private final AlertRaisedHandler handler;
  private final JsonMapper jsonMapper;

  public AlertEventsController(AlertRaisedHandler handler, JsonMapper jsonMapper) {
    this.handler = handler;
    this.jsonMapper = jsonMapper;
  }

  @Topic(name = "${app.topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.dead-letter-topic}", metadata = "{\"isRawPayload\": \"true\"}")
  @PostMapping("/events/pubsub/alerts")
  public ResponseEntity<TopicEventStatus> onAlertRaised(@RequestBody CloudEvent<AlertRaised> event) {
    AlertRaised alertRaised;
    try {
      alertRaised = jsonMapper.readValue(event.getBinaryData(), AlertRaised.class);
    } catch (JacksonException e) {
      return ResponseEntity.ok(TopicEventStatus.DROP);
    }
    return ResponseEntity.ok(handler.handle(alertRaised));
  }

  @Topic(name = "${app.dead-letter-topic}", pubsubName = "${dapr.pubsub.name}")
  @PostMapping("/events/pubsub/alerts-deadletter")
  public ResponseEntity<TopicEventStatus> onDeadLetter(@RequestBody CloudEvent<Object> event) {
    handler.handleDeadLetter(event.getId(), event.getData());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }
}
