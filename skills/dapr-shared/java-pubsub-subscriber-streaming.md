# Java streaming subscriber

The app opens a gRPC stream to the sidecar with `DaprPreviewClient.subscribeToTopic(...)` and the sidecar
pushes messages over it. No subscription route, no `appPort`, no Subscription YAML. It uses `<EventName>`,
`TopicEventStatus`, `ProcessedEvents`, `InMemoryProcessedEvents` and `<EventName>Handler` from
[java-pubsub-handler.md](java-pubsub-handler.md), but not `UnreadableEventAdvice`. Resolve every
placeholder from the specification interview before copying this file; the vocabulary is in
[pubsub-placeholders.md](pubsub-placeholders.md). All files go in
`subscriber/src/main/java/<javaPackage>/subscriber/`.

> **Preview API.** The streaming subscription API is a preview, and its delivery differs from the
> declarative and programmatic types (see [references/java/gotchas.md](references/java/gotchas.md) §3):
> the SDK acks every event it hands to the app as SUCCESS, whatever the handler decides, so **the app
> cannot choose RETRY or DROP**. A handler that fails loses the event: it is acked and not redelivered.
> Only a body that cannot be deserialized is dead-lettered. An exception that escapes the handler closes
> the stream and turns the event into a poison message that Redis redelivers forever, so the handler must
> catch it. State this in the generated README.

## StreamingConfiguration

`StreamingConfiguration.java`:

```java
package <javaPackage>.subscriber;

import io.dapr.client.DaprClientBuilder;
import io.dapr.client.DaprPreviewClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class StreamingConfiguration {

  // DaprPreviewClient is not autoconfigured; build it from the autoconfigured DaprClientBuilder so it
  // uses the same connection settings and serializer as the DaprClient bean.
  @Bean
  public DaprPreviewClient daprPreviewClient(DaprClientBuilder daprClientBuilder) {
    return daprClientBuilder.buildPreviewClient();
  }
}
```

## <TopicResource>StreamingSubscriber

`<TopicResource>StreamingSubscriber.java`:

```java
package <javaPackage>.subscriber;

import io.dapr.client.DaprPreviewClient;
import io.dapr.client.domain.CloudEvent;
import io.dapr.utils.TypeRef;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import reactor.core.Disposable;
import reactor.util.retry.Retry;

@Component
public class <TopicResource>StreamingSubscriber implements SmartLifecycle {

  private static final Logger logger = LoggerFactory.getLogger(<TopicResource>StreamingSubscriber.class);

  private final DaprPreviewClient previewClient;
  private final <EventName>Handler handler;
  private final String pubsubName;
  private final String topic;
  private final String deadLetterTopic;
  private final List<Disposable> subscriptions = new ArrayList<>();

  public <TopicResource>StreamingSubscriber(
      DaprPreviewClient previewClient,
      <EventName>Handler handler,
      @Value("${dapr.pubsub.name}") String pubsubName,
      @Value("${app.topic}") String topic,
      @Value("${app.dead-letter-topic}") String deadLetterTopic) {
    this.previewClient = previewClient;
    this.handler = handler;
    this.pubsubName = pubsubName;
    this.topic = topic;
    this.deadLetterTopic = deadLetterTopic;
  }

  @Override
  public void start() {
    // The SDK acks SUCCESS as soon as the event is emitted, so the handler cannot ask for RETRY or DROP.
    // Never let an exception escape the handler: it ends the gRPC stream and the event loops in the broker.
    // A body that fails to deserialize is acked DROP (dead-lettered) and ends the stream; retryWhen
    // opens a new stream so later events keep arriving.
    subscriptions.add(previewClient
        .subscribeToTopic(pubsubName, topic, deadLetterTopic, new TypeRef<CloudEvent<<EventName>>>() { })
        .doOnNext(this::handleSafely)
        .doOnError(error -> logger.warn("Streaming subscription to {} failed; resubscribing: {}", topic,
            error.getMessage()))
        .retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30)))
        .subscribe());
    subscriptions.add(previewClient
        .subscribeToTopic(pubsubName, deadLetterTopic, new TypeRef<CloudEvent<Object>>() { })
        .doOnNext(event -> handler.handleDeadLetter(event.getId(), event.getData()))
        .retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30)))
        .subscribe());
    logger.info("Streaming subscriptions to {} and {} started", topic, deadLetterTopic);
  }

  private void handleSafely(CloudEvent<<EventName>> event) {
    try {
      TopicEventStatus status = handler.handle(event.getData());
      logger.info("Streaming handler returned {} for event {} (the SDK acks SUCCESS regardless)",
          status.status(), event.getId());
    } catch (RuntimeException e) {
      logger.error("Handling streamed event {} failed; it is acked and will not be redelivered", event.getId(), e);
    }
  }

  @Override
  public void stop() {
    subscriptions.forEach(Disposable::dispose);
    subscriptions.clear();
  }

  @Override
  public boolean isRunning() {
    return !subscriptions.isEmpty();
  }
}
```

With several events, add one `subscribeToTopic` pair per topic in `start()`, each with its own
`handleSafely` method.

## Raw payload

Pass `Map.of("rawPayload", "true")` as the last argument of `subscribeToTopic(pubsubName, topic,
deadLetterTopic, typeRef, metadata)`, and publish with `rawPayload` too.

## Key points

- The handler runs inside `.doOnNext(...)`, wrapped in `try`/`catch (RuntimeException e)` that logs the
  failure. Never let an exception escape: it closes the stream before the ack, and the message is
  redelivered and fails again without ever being dead-lettered.
- `.retryWhen(Retry.backoff(...))` before `.subscribe()` opens a new stream after a deserialization failure
  or a lost connection; without it the subscription ends and later events are not delivered.
- `DaprPreviewClient` is not autoconfigured: declare it from the autoconfigured `DaprClientBuilder`.
- The subscriptions start in `SmartLifecycle.start()`, once the application context is ready, and are
  disposed in `stop()`, which closes the streams when the app shuts down.
- No routing: a streaming subscription cannot route by content.
- `dapr.yaml` has no `appPort` for this app. The sidecar then logs `App channel is not initialized`,
  which is expected.
