package com.example.returns;

import io.dapr.client.DaprClient;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/returns")
public class ReturnController {

  static final String STORE = "returns-store";

  private final DaprClient daprClient;

  public ReturnController(DaprClient daprClient) {
    this.daprClient = daprClient;
  }

  @PostMapping
  public ResponseEntity<ProductReturn> create(@RequestBody ProductReturn productReturn) {
    if (productReturn.id() == null || productReturn.sku() == null) {
      return ResponseEntity.badRequest().build();
    }
    daprClient.saveState(STORE, productReturn.id(), productReturn).block();
    return ResponseEntity.created(URI.create("/returns/" + productReturn.id())).body(productReturn);
  }

  @GetMapping("/{id}")
  public ResponseEntity<ProductReturn> get(@PathVariable String id) {
    ProductReturn found = daprClient.getState(STORE, id, ProductReturn.class).block().getValue();
    return found == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(found);
  }
}
