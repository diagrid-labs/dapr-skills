package com.example.shiptrack.subscriber;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ShipmentDispatchedHandler {

  private static final Logger logger = LoggerFactory.getLogger(ShipmentDispatchedHandler.class);

  private final ProcessedEvents processedEvents;

  public ShipmentDispatchedHandler(ProcessedEvents processedEvents) {
    this.processedEvents = processedEvents;
  }

  /** Returns SUCCESS or DROP. Throws on a transient error so Dapr retries. */
  public TopicEventStatus handle(ShipmentDispatched shipmentDispatched) {
    if (shipmentDispatched == null || shipmentDispatched.shipmentId() == null || shipmentDispatched.shipmentId().isBlank()) {
      logger.warn("Dropping invalid shipment dispatched event: {}", shipmentDispatched);
      return TopicEventStatus.DROP;
    }
    if (processedEvents.isProcessed(shipmentDispatched.shipmentId())) {
      logger.info("Shipment dispatched {} was already processed; acknowledging the duplicate", shipmentDispatched.shipmentId());
      return TopicEventStatus.SUCCESS;
    }
    logger.info("Shipment {} dispatched with {} ({} parcels) at {}", shipmentDispatched.shipmentId(),
        shipmentDispatched.carrier(), shipmentDispatched.parcelCount(), shipmentDispatched.dispatchedAt());
    processedEvents.markProcessed(shipmentDispatched.shipmentId());
    return TopicEventStatus.SUCCESS;
  }

  public void handleDeadLetter(String eventId, Object data) {
    logger.error("Dead-lettered shipment dispatched event {}: {}", eventId, data);
  }
}
