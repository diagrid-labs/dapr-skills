package com.example.shipments;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class ShipmentService {

  private final Map<String, Shipment> shipments = new ConcurrentHashMap<>();

  public Shipment create(Shipment shipment) {
    if (shipment.carrier() == null || shipment.carrier().isBlank()) {
      throw new IllegalArgumentException("carrier is required");
    }
    String id = UUID.randomUUID().toString();
    Shipment created = new Shipment(id, shipment.orderReference(), shipment.carrier(), shipment.destination(),
        "CREATED");
    shipments.put(id, created);
    return created;
  }

  public Optional<Shipment> find(String id) {
    return Optional.ofNullable(shipments.get(id));
  }
}
