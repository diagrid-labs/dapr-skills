package com.example.notifications;

import io.dapr.Topic;
import io.dapr.client.domain.CloudEvent;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class EmailEventsController {

  private final EmailSender emailSender;

  public EmailEventsController(EmailSender emailSender) {
    this.emailSender = emailSender;
  }

  @Topic(name = "${app.emails-topic}", pubsubName = "${dapr.pubsub.name}")
  @PostMapping("/events/pubsub/emails")
  public ResponseEntity<Map<String, String>> onEmailRequested(@RequestBody CloudEvent<EmailRequested> event) {
    EmailRequested email = event.getData();
    emailSender.send(email.to(), email.subject(), email.body());
    return ResponseEntity.ok(Map.of("status", "SUCCESS"));
  }
}
