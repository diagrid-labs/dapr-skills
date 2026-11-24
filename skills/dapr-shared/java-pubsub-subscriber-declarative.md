# Java declarative subscriber

A Spring Boot app with plain POST routes and no Dapr subscription code: `resources/subscription.yaml`
([dapr-pubsub-subscription.md](dapr-pubsub-subscription.md)) tells the sidecar which topic goes to which
route. It uses the handler files from [java-pubsub-handler.md](java-pubsub-handler.md). Resolve every
placeholder from the specification interview before copying this file; the vocabulary is in
[pubsub-placeholders.md](pubsub-placeholders.md).

## <TopicResource>EventsController

`subscriber/src/main/java/<javaPackage>/subscriber/<TopicResource>EventsController.java`:

```java
package <javaPackage>.subscriber;

import io.dapr.client.domain.CloudEvent;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Routes are wired by resources/subscription.yaml; no @Topic here. */
@RestController
public class <TopicResource>EventsController {

  private final <EventName>Handler handler;

  public <TopicResource>EventsController(<EventName>Handler handler) {
    this.handler = handler;
  }

  @PostMapping("<SubscribeRoute>")
  public ResponseEntity<TopicEventStatus> on<EventName>(@RequestBody CloudEvent<<EventName>> event) {
    return ResponseEntity.ok(handler.handle(event.getData()));
  }

  @PostMapping("<DeadLetterRoute>")
  public ResponseEntity<TopicEventStatus> onDeadLetter(@RequestBody CloudEvent<Object> event) {
    handler.handleDeadLetter(event.getId(), event.getData());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }
}
```

With several events, add one route pair per topic, each matching its own Subscription document.

## Routing rules

When the user asked for content-based routing, add one route per rule, matching the `path` of each rule in
`subscription.yaml` (**With routing rules**):

```java
  @PostMapping("<SubscribeRoute>/<RuleName>")
  public ResponseEntity<TopicEventStatus> on<EventName><RuleName>(@RequestBody CloudEvent<<EventName>> event) {
    return ResponseEntity.ok(handler.handle(event.getData()));
  }
```

Write `<RuleName>` in PascalCase in the method name (`onShipmentDispatchedExpress`) and lowercase in the path.

## Raw payload

When the user asked for raw payloads, add `rawPayload: "true"` to the Subscription (see
[dapr-pubsub-subscription.md](dapr-pubsub-subscription.md) → **With raw payload**), publish with
`rawPayload` too (see [java-pubsub-publisher.md](java-pubsub-publisher.md) → **TTL and raw payload**), and
change the topic route.

A raw message has no CloudEvent `data`: the sidecar delivers its bytes as `data_base64`, which binds to
`event.getBinaryData()`. Read the record from those bytes with Spring's autoconfigured Jackson 3
`JsonMapper` (`tools.jackson.databind.json.JsonMapper`), taken through the controller's constructor into a
`final` field. A body that cannot be read throws `tools.jackson.core.JacksonException`, which
`UnreadableEventAdvice` does not see, so the route maps it to DROP itself:

```java
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
```

## Key points

- Declare the parameter as `@RequestBody CloudEvent<<EventName>>`: Spring's Jackson binds the envelope and
  its `data` to the record (`java.time` fields included).
- Every route in `subscription.yaml` must exist here as a POST route; a missing route answers 404 and Dapr
  drops the message.
- The subscription hot-reloads: editing `subscription.yaml` needs no restart.
- Never also add `@Topic` for the same topic; one subscription type per topic per app.
- The subscriber needs `appPort` in `dapr.yaml`, equal to `server.port`.
