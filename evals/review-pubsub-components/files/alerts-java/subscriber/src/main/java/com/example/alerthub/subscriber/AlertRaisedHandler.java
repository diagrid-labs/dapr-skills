package com.example.alerthub.subscriber;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class AlertRaisedHandler {

  private static final Logger logger = LoggerFactory.getLogger(AlertRaisedHandler.class);

  private final ProcessedEvents processedEvents;

  public AlertRaisedHandler(ProcessedEvents processedEvents) {
    this.processedEvents = processedEvents;
  }

  /** Returns SUCCESS or DROP. Throws on a transient error so Dapr retries. */
  public TopicEventStatus handle(AlertRaised alertRaised) {
    if (alertRaised == null || alertRaised.alertId() == null || alertRaised.alertId().isBlank()) {
      logger.warn("Dropping invalid alert raised event: {}", alertRaised);
      return TopicEventStatus.DROP;
    }
    if (processedEvents.isProcessed(alertRaised.alertId())) {
      logger.info("Alert raised {} was already processed; acknowledging the duplicate", alertRaised.alertId());
      return TopicEventStatus.SUCCESS;
    }
    logger.info("Alert {} ({}): {}", alertRaised.alertId(), alertRaised.severity(), alertRaised.message());
    processedEvents.markProcessed(alertRaised.alertId());
    return TopicEventStatus.SUCCESS;
  }

  public void handleDeadLetter(String eventId, Object data) {
    logger.error("Dead-lettered alert raised event {}: {}", eventId, data);
  }
}
