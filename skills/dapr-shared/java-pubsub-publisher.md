# Java pub/sub publisher

A Spring Boot publisher that accepts an `<EventName>` and publishes it to the `<TopicName>` topic through
the Dapr sidecar. Resolve every placeholder from the specification interview before copying this file; the
vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md). In a new project (create-pubsub-java) all files go in
`publisher/src/main/java/<javaPackage>/publisher/`. In an existing app (add-pubsub-java) they go in that app's base package, and `package <javaPackage>.publisher;` becomes `package <javaPackage>;` (see add-pubsub-java's REFERENCE.md → **Resolving the placeholders**).

## Message record

`<EventName>.java`. The subscriber has its own copy in `<javaPackage>.subscriber`; there is no shared module.

```java
package <javaPackage>.publisher;

public record <EventName>(<EventFields>) {
}
```

`<EventFields>` are the record components from the interview, with `<idField>` among them, for example
`String shipmentId, String carrier, Instant dispatchedAt` (import `java.time.Instant` for a timestamp).
Both copies of the record must have the same components: they are the message contract.

## Publish endpoint

`<PublishResource>Controller.java`:

```java
package <javaPackage>.publisher;

import io.dapr.client.DaprClient;
import io.dapr.spring.boot.properties.pubsub.DaprPubSubProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class <PublishResource>Controller {

  private final DaprClient daprClient;
  private final DaprPubSubProperties pubSubProperties;
  private final String topic;

  public <PublishResource>Controller(
      DaprClient daprClient,
      DaprPubSubProperties pubSubProperties,
      @Value("${app.topic}") String topic) {
    this.daprClient = daprClient;
    this.pubSubProperties = pubSubProperties;
    this.topic = topic;
  }

  @PostMapping("/<PublishRoute>")
  public ResponseEntity<<EventName>> publish(@RequestBody <EventName> <eventVar>) {
    daprClient.publishEvent(pubSubProperties.getName(), topic, <eventVar>).block();
    return ResponseEntity.accepted().body(<eventVar>);
  }
}
```

With several events, add one `@PostMapping` method per event, each publishing to its own topic property.

## TTL and raw payload

Pass message metadata as the fourth argument (import `java.util.Map`). Values are strings. Add only the
metadata the user asked for: a TTL the user did not ask for makes a message expire instead of reaching the
dead-letter topic (see [references/java/gotchas.md](references/java/gotchas.md) §2).

TTL only:

```java
daprClient.publishEvent(pubSubProperties.getName(), topic, <eventVar>, Map.of("ttlInSeconds", "60")).block();
```

Raw payload only (no CloudEvent envelope); configure the subscriber for raw payloads too:

```java
daprClient.publishEvent(pubSubProperties.getName(), topic, <eventVar>, Map.of("rawPayload", "true")).block();
```

Only when the user asked for both, combine them: `Map.of("ttlInSeconds", "60", "rawPayload", "true")`.

## Key points

- Publish with `DaprClient.publishEvent(...).block()`. Never use `DaprMessagingTemplate`: it publishes every
  message with a 10-second TTL that cannot be changed, so a message whose handler keeps failing expires
  instead of reaching the dead-letter topic (see [references/java/gotchas.md](references/java/gotchas.md) §2).
- `.block()` waits until the sidecar has accepted the message. A failed publish throws `DaprException`, so
  Spring answers 500 and the caller knows the event was not published; never swallow it.
- The pub/sub name comes from `dapr.pubsub.name` through `DaprPubSubProperties`, and the topic from
  `app.topic`; neither is hard-coded.
- The `DaprClient` bean is autoconfigured by `dapr-spring-boot-starter`. Take it through the constructor
  into a `final` field; never use field `@Autowired` and never build a second client.
- Jackson serializes the record with its component names as JSON keys, so the `pubsub.http` bodies use
  the camelCase component names.
- Never set `cloudevent.trace*` metadata; the sidecar propagates trace context.
