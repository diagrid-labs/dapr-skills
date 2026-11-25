package com.example.shipments;

import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/shipments")
public class ShipmentController {

  private final ShipmentService shipments;

  public ShipmentController(ShipmentService shipments) {
    this.shipments = shipments;
  }

  @PostMapping
  public ResponseEntity<Shipment> create(@RequestBody Shipment shipment) {
    Shipment created = shipments.create(shipment);
    return ResponseEntity.created(URI.create("/shipments/" + created.id())).body(created);
  }

  @GetMapping("/{id}")
  public ResponseEntity<Shipment> get(@PathVariable String id) {
    return shipments.find(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
  }
}
