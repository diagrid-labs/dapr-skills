package com.example.shiptrack.subscriber;

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
public class ShipmentStreamingSubscriber implements SmartLifecycle {

  private static final Logger logger = LoggerFactory.getLogger(ShipmentStreamingSubscriber.class);

  private final DaprPreviewClient previewClient;
  private final ShipmentDispatchedHandler handler;
  private final String pubsubName;
  private final String topic;
  private final String deadLetterTopic;
  private final List<Disposable> subscriptions = new ArrayList<>();

  public ShipmentStreamingSubscriber(
      DaprPreviewClient previewClient,
      ShipmentDispatchedHandler handler,
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
        .subscribeToTopic(pubsubName, topic, deadLetterTopic, new TypeRef<CloudEvent<ShipmentDispatched>>() { })
        .doOnNext(this::handleSafely)
        .doOnError(error -> logger.warn("Streaming subscription to {} failed; resubscribing: {}", topic,
            error.getMessage()))
        .retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30))
            .transientErrors(true))
        .subscribe());
    subscriptions.add(previewClient
        .subscribeToTopic(pubsubName, deadLetterTopic, new TypeRef<CloudEvent<Object>>() { })
        .doOnNext(event -> handler.handleDeadLetter(event.getId(), event.getData()))
        .doOnError(error -> logger.warn("Streaming subscription to {} failed; resubscribing: {}", deadLetterTopic,
            error.getMessage()))
        .retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30))
            .transientErrors(true))
        .subscribe());
    logger.info("Streaming subscriptions to {} and {} started", topic, deadLetterTopic);
  }

  private void handleSafely(CloudEvent<ShipmentDispatched> event) {
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
