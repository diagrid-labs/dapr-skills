package com.example.fulfilment.worker;

import io.dapr.client.DaprPreviewClient;
import io.dapr.client.Subscription;
import io.dapr.client.SubscriptionListener;
import io.dapr.client.domain.CloudEvent;
import io.dapr.utils.TypeRef;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
public class CreditNoteSubscriber implements SmartLifecycle {

  private static final Logger logger = LoggerFactory.getLogger(CreditNoteSubscriber.class);

  private final DaprPreviewClient previewClient;
  private final String pubsubName;
  private final String topic;
  private Subscription<CreditNoteIssued> creditNotes;

  public CreditNoteSubscriber(
      DaprPreviewClient previewClient,
      @Value("${dapr.pubsub.name}") String pubsubName,
      @Value("${app.credit-notes-topic}") String topic) {
    this.previewClient = previewClient;
    this.pubsubName = pubsubName;
    this.topic = topic;
  }

  @Override
  public void start() {
    creditNotes = previewClient.subscribeToEvents(pubsubName, topic, new SubscriptionListener<CreditNoteIssued>() {
      @Override
      public Mono<Status> onEvent(CloudEvent<CreditNoteIssued> event) {
        CreditNoteIssued note = event.getData();
        if (note.amountCents() == 0) {
          return Mono.empty();
        }
        logger.info("Credit note {} of {} cents for order {}", note.creditNoteId(), note.amountCents(), note.orderId());
        return Mono.just(Status.SUCCESS);
      }

      @Override
      public void onError(RuntimeException exception) {
        logger.error("Credit note subscription error", exception);
      }
    }, TypeRef.get(CreditNoteIssued.class));
  }

  @Override
  public void stop() {
    if (creditNotes != null) {
      creditNotes.close();
      creditNotes = null;
    }
  }

  @Override
  public boolean isRunning() {
    return creditNotes != null;
  }
}
