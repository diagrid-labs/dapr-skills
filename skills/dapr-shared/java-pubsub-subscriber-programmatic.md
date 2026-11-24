# Java programmatic subscriber

A Spring Boot app that declares its subscriptions in code with `@Topic`. The `dapr-spring-boot-starter`
serves them on `GET /dapr/subscribe`, which the sidecar reads at start-up. It uses the handler files from
[java-pubsub-handler.md](java-pubsub-handler.md). Resolve every placeholder from the specification
interview before copying this file; the vocabulary is in [pubsub-placeholders.md](pubsub-placeholders.md).

## <TopicResource>EventsController

`subscriber/src/main/java/<javaPackage>/subscriber/<TopicResource>EventsController.java`:

```java
package <javaPackage>.subscriber;

import io.dapr.Topic;
import io.dapr.client.domain.CloudEvent;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class <TopicResource>EventsController {

  private final <EventName>Handler handler;

  public <TopicResource>EventsController(<EventName>Handler handler) {
    this.handler = handler;
  }

  @Topic(name = "${app.topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.dead-letter-topic}")
  @PostMapping("<SubscribeRoute>")
  public ResponseEntity<TopicEventStatus> on<EventName>(@RequestBody CloudEvent<<EventName>> event) {
    return ResponseEntity.ok(handler.handle(event.getData()));
  }

  @Topic(name = "${app.dead-letter-topic}", pubsubName = "${dapr.pubsub.name}")
  @PostMapping("<DeadLetterRoute>")
  public ResponseEntity<TopicEventStatus> onDeadLetter(@RequestBody CloudEvent<Object> event) {
    handler.handleDeadLetter(event.getId(), event.getData());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }
}
```

With several events, add one `@Topic` route pair per topic, each with its own topic properties.

## Routing rules

When the user asked for content-based routing, add one method per rule with `rule = @Rule(...)` (import
`io.dapr.Rule`). The method without a rule stays as the default route.

```java
  @Topic(name = "${app.topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.dead-letter-topic}",
      rule = @Rule(match = "<MatchExpression>", priority = 1))
  @PostMapping("<SubscribeRoute>/<RuleName>")
  public ResponseEntity<TopicEventStatus> on<EventName><RuleName>(@RequestBody CloudEvent<<EventName>> event) {
    return ResponseEntity.ok(handler.handle(event.getData()));
  }
```

Write `<RuleName>` in PascalCase in the method name and lowercase in the path. Give each further rule the
next `priority` (2, 3, ...). Every numeric comparison in `<MatchExpression>` wraps the field in `int()`.

## Raw payload

Add `metadata = "{\"rawPayload\": \"true\"}"` to the `@Topic` of the topic route and of the dead-letter route, and publish with
`rawPayload` too (see [java-pubsub-publisher.md](java-pubsub-publisher.md) → **TTL and raw payload**).

A raw message has no CloudEvent `data`: the sidecar delivers its bytes as `data_base64`, which binds to
`event.getBinaryData()`. Read the record from those bytes with Spring's autoconfigured Jackson 3
`JsonMapper` (`tools.jackson.databind.json.JsonMapper`), taken through the controller's constructor into a
`final` field. A body that cannot be read throws `tools.jackson.core.JacksonException`, which
`UnreadableEventAdvice` does not see, so the route maps it to DROP itself. The whole controller for a raw
topic, replacing the one above:

```java
package <javaPackage>.subscriber;

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
public class <TopicResource>EventsController {

  private final <EventName>Handler handler;
  private final JsonMapper jsonMapper;

  public <TopicResource>EventsController(<EventName>Handler handler, JsonMapper jsonMapper) {
    this.handler = handler;
    this.jsonMapper = jsonMapper;
  }

  @Topic(name = "${app.topic}", pubsubName = "${dapr.pubsub.name}",
      deadLetterTopic = "${app.dead-letter-topic}", metadata = "{\"rawPayload\": \"true\"}")
  @PostMapping("<SubscribeRoute>")
  public ResponseEntity<TopicEventStatus> on<EventName>(@RequestBody CloudEvent<<EventName>> event) {
    <EventName> <eventVar>;
    try {
      <eventVar> = jsonMapper.readValue(event.getBinaryData(), <EventName>.class);
    } catch (JacksonException e) {
      return ResponseEntity.ok(TopicEventStatus.DROP);
    }
    return ResponseEntity.ok(handler.handle(<eventVar>));
  }

  @Topic(name = "${app.dead-letter-topic}", pubsubName = "${dapr.pubsub.name}",
      metadata = "{\"rawPayload\": \"true\"}")
  @PostMapping("<DeadLetterRoute>")
  public ResponseEntity<TopicEventStatus> onDeadLetter(@RequestBody CloudEvent<Object> event) {
    handler.handleDeadLetter(event.getId(), new String(event.getBinaryData(), StandardCharsets.UTF_8));
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }
}
```

A dead-lettered raw message is raw too. The dead-letter subscription needs `rawPayload` as well: without it
the sidecar fails with `error deserializing cloud event` on the dead-letter topic and the message never
reaches the app. With it, the dead-letter route gets `data` null and the bytes in `data_base64`, so it logs
`event.getBinaryData()` as text, as above.

## Key points

- `@Topic` takes the topic, pub/sub name and dead-letter topic from `${...}` property placeholders, never
  hard-coded strings; the starter resolves them and advertises the rule, the default route and the
  dead-letter topic on `/dapr/subscribe` (see [references/java/gotchas.md](references/java/gotchas.md) §8).
- The sidecar reads `/dapr/subscribe` once, at start-up; restart the app and sidecar after changing a
  subscription.
- A CEL rule that cannot evaluate the payload never reaches the app: the sidecar dead-letters the message.
- The subscriber needs `appPort` in `dapr.yaml`, equal to `server.port`.
- Never also add `subscription.yaml` for the same topic.
