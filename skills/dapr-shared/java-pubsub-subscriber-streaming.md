# Java streaming subscriber

The app opens a gRPC stream to the sidecar with `DaprPreviewClient.subscribeToTopic(...)` and the sidecar
pushes messages over it. No subscription route, no `appPort`, no Subscription YAML. It uses `<EventName>`,
`TopicEventStatus`, `ProcessedEvents`, `InMemoryProcessedEvents` and `<EventName>Handler` from
[java-pubsub-handler.md](java-pubsub-handler.md), but not `UnreadableEventAdvice`. Resolve every
placeholder from the specification interview before copying this file; the vocabulary is in
[pubsub-placeholders.md](pubsub-placeholders.md). In a new project (create-pubsub-java) all files go in
`subscriber/src/main/java/<javaPackage>/subscriber/`. In an existing app (add-pubsub-java) the files go in that app's base package instead, and `package <javaPackage>.subscriber;` becomes `package <javaPackage>;` (see add-pubsub-java's REFERENCE.md → **Resolving the placeholders**).

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
  // uses the same connection settings and serializer as the DaprClient bean. The object is a DaprClientImpl,
  // which is a DaprClient too: defaultCandidate = false keeps it out of unqualified DaprClient injection
  // points, and the subscriber asks for it by name with @Qualifier.
  @Bean(defaultCandidate = false)
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
import org.springframework.beans.factory.annotation.Qualifier;
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
      @Qualifier("daprPreviewClient") DaprPreviewClient previewClient,
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
    // opens a new stream so later events keep arriving. transientErrors(true) resets the backoff after
    // each event that arrives, so a poison message now and then does not push reconnects towards 30s.
    subscriptions.add(previewClient
        .subscribeToTopic(pubsubName, topic, deadLetterTopic, new TypeRef<CloudEvent<<EventName>>>() { })
        .doOnNext(this::handleSafely)
        .doOnError(error -> logger.warn("Streaming subscription to {} failed; resubscribing: {}", topic,
            error.getMessage()))
        .retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30))
            .transientErrors(true))
        .subscribe());
    subscriptions.add(previewClient
        .subscribeToTopic(pubsubName, deadLetterTopic, new TypeRef<CloudEvent<Object>>() { })
        .doOnNext(this::handleDeadLetterSafely)
        .doOnError(error -> logger.warn("Streaming subscription to {} failed; resubscribing: {}", deadLetterTopic,
            error.getMessage()))
        .retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30))
            .transientErrors(true))
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

  private void handleDeadLetterSafely(CloudEvent<Object> event) {
    try {
      handler.handleDeadLetter(event.getId(), event.getData());
    } catch (RuntimeException e) {
      logger.error("Handling dead-lettered event {} failed; it is acked and will not be redelivered", event.getId(), e);
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
`handleSafely` and `handleDeadLetterSafely` methods.

## Raw payload

Pass `Map.of("rawPayload", "true")` as the last argument of `subscribeToTopic(pubsubName, topic,
deadLetterTopic, typeRef, metadata)` and of the dead-letter `subscribeToTopic(pubsubName, deadLetterTopic,
typeRef, metadata)`, and publish with `rawPayload` too. A dead-lettered raw message is raw too: without
`rawPayload` on its subscription the sidecar cannot read it as a CloudEvent (seen with a programmatic
subscription; not run for streaming).

## Key points

- The handler runs inside `.doOnNext(...)`, wrapped in `try`/`catch (RuntimeException e)` that logs the
  failure. Never let an exception escape: it closes the stream before the ack, and the message is
  redelivered and fails again without ever being dead-lettered. The dead-letter consumer is wrapped the
  same way: `handleDeadLetter` only logs today, but it is where an app adds alerting or parking, and an
  exception there would loop the dead-lettered message.
- `.retryWhen(Retry.backoff(...).transientErrors(true))` before `.subscribe()` opens a new stream after a
  deserialization failure or a lost connection; without it the subscription ends and later events are not
  delivered. `transientErrors(true)` resets the backoff once an event arrives on the new stream, so
  reconnects stay near 1s; without it every failure doubles the wait, up to 30s, and messages sit pending
  while no stream is open.
- Log `doOnError` on both streams, so every reconnect shows in the log.
- `DaprPreviewClient` is not autoconfigured: declare it from the autoconfigured `DaprClientBuilder`, with
  `@Bean(defaultCandidate = false)`, and inject it with `@Qualifier("daprPreviewClient")`. The object is a
  `DaprClientImpl`, which implements both `DaprClient` and `DaprPreviewClient`, as does the autoconfigured
  `DaprClient` bean; without both settings an app that also injects `DaprClient` fails to start with
  `NoUniqueBeanDefinitionException` (gotchas §3).
- The subscriptions start in `SmartLifecycle.start()`, once the application context is ready, and are
  disposed in `stop()`, which closes the streams when the app shuts down.
- No routing: a streaming subscription cannot route by content.
- `dapr.yaml` has no `appPort` for this app. The sidecar then logs `App channel is not initialized`,
  which is expected.
