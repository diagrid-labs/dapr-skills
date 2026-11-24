package com.example.fulfilment.worker;

import io.dapr.client.DaprPreviewClient;
import io.dapr.client.domain.CloudEvent;
import io.dapr.utils.TypeRef;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import reactor.core.Disposable;
import reactor.util.retry.Retry;

@Component
public class InvoiceStreamingSubscriber implements SmartLifecycle {

  private static final Logger logger = LoggerFactory.getLogger(InvoiceStreamingSubscriber.class);

  private final DaprPreviewClient previewClient;
  private final InvoiceHandler handler;
  private final String pubsubName;
  private final String topic;
  private final String deadLetterTopic;
  private Disposable invoices;

  public InvoiceStreamingSubscriber(
      DaprPreviewClient previewClient,
      InvoiceHandler handler,
      @Value("${dapr.pubsub.name}") String pubsubName,
      @Value("${app.invoices-topic}") String topic,
      @Value("${app.invoices-dead-letter-topic}") String deadLetterTopic) {
    this.previewClient = previewClient;
    this.handler = handler;
    this.pubsubName = pubsubName;
    this.topic = topic;
    this.deadLetterTopic = deadLetterTopic;
  }

  @Override
  public void start() {
    invoices = previewClient
        .subscribeToTopic(pubsubName, topic, deadLetterTopic, new TypeRef<CloudEvent<InvoiceIssued>>() { })
        .doOnNext(this::onInvoice)
        .subscribe();
    previewClient
        .subscribeToEvents(pubsubName, deadLetterTopic, new TypeRef<CloudEvent<Object>>() { })
        .retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(1)).maxBackoff(Duration.ofSeconds(30)))
        .subscribe(event -> logger.error("Dead-lettered invoice event {}: {}", event.getId(), event.getData()));
  }

  private void onInvoice(CloudEvent<InvoiceIssued> event) {
    InvoiceIssued invoice = event.getData();
    if (invoice.amountCents() <= 0) {
      logger.warn("Dropping invoice event {} with a non-positive amount", event.getId());
      return;
    }
    handler.handle(invoice);
  }

  @Override
  public void stop() {
    if (invoices != null) {
      invoices.dispose();
      invoices = null;
    }
  }

  @Override
  public boolean isRunning() {
    return invoices != null;
  }
}
