package com.example.checkout;

import io.dapr.client.DaprPreviewClient;
import io.dapr.client.domain.BulkPublishResponse;
import io.dapr.spring.boot.properties.pubsub.DaprPubSubProperties;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class BulkOrderPublisher {

  private static final Logger logger = LoggerFactory.getLogger(BulkOrderPublisher.class);

  private final DaprPreviewClient previewClient;
  private final DaprPubSubProperties pubSubProperties;
  private final String topic;

  public BulkOrderPublisher(
      DaprPreviewClient previewClient,
      DaprPubSubProperties pubSubProperties,
      @Value("${app.topic}") String topic) {
    this.previewClient = previewClient;
    this.pubSubProperties = pubSubProperties;
    this.topic = topic;
  }

  public int publishAll(List<OrderPlaced> orders) {
    BulkPublishResponse<OrderPlaced> response = previewClient
        .publishEvents(pubSubProperties.getName(), topic, "application/json", orders)
        .block();
    if (response != null && !response.getFailedEntries().isEmpty()) {
      logger.warn("{} of {} orders failed to publish", response.getFailedEntries().size(), orders.size());
      throw new IllegalStateException("Bulk publish had failed entries");
    }
    return orders.size();
  }
}
