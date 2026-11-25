package com.example.catalog;

import java.math.BigDecimal;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PriceController {

  private final Map<String, BigDecimal> prices = new ConcurrentHashMap<>();

  @PutMapping("/products/{sku}/price")
  public ResponseEntity<Void> setPrice(@PathVariable String sku, @RequestBody BigDecimal price) {
    prices.put(sku, price);
    return ResponseEntity.noContent().build();
  }
}
