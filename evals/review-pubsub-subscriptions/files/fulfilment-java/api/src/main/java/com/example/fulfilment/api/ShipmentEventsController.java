package com.example.fulfilment.api;

import io.dapr.client.domain.CloudEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Routes are wired by resources/subscription.yaml; no @Topic here. */
@RestController
@RequestMapping("/events/pubsub")
public class ShipmentEventsController {

  private static final Logger logger = LoggerFactory.getLogger(ShipmentEventsController.class);

  @PostMapping("/shipments")
  public ResponseEntity<TopicEventStatus> onShipment(@RequestBody CloudEvent<ShipmentBooked> event) {
    ShipmentBooked shipment = event.getData();
    if (shipment.cancelled()) {
      return ResponseEntity.ok(new TopicEventStatus("IGNORED"));
    }
    logger.info("Shipment {} booked for order {} ({} kg)", shipment.shipmentId(), shipment.orderId(), shipment.weight());
    return ResponseEntity.ok(TopicEventStatus.SUCCESS);
  }
}
