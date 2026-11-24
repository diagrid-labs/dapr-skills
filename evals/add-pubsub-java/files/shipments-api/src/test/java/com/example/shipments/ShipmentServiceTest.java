package com.example.shipments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ShipmentServiceTest {

  private final ShipmentService service = new ShipmentService();

  @Test
  void createStoresTheShipmentAsCreated() {
    Shipment created = service.create(new Shipment(null, "ORD-7", "DHL", "Utrecht", null));

    assertThat(created.status()).isEqualTo("CREATED");
    assertThat(service.find(created.id())).contains(created);
  }

  @Test
  void createRejectsAShipmentWithoutCarrier() {
    assertThatThrownBy(() -> service.create(new Shipment(null, "ORD-8", " ", "Leiden", null)))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
