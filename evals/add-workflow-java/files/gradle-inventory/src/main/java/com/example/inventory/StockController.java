package com.example.inventory;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class StockController {

  private final Map<String, Integer> stock = new ConcurrentHashMap<>();

  @PostMapping("/stock/{sku}")
  public Map<String, Integer> receive(@PathVariable String sku, @RequestBody int quantity) {
    stock.merge(sku, quantity, Integer::sum);
    return Map.of(sku, stock.get(sku));
  }

  @GetMapping("/stock/{sku}")
  public Map<String, Integer> get(@PathVariable String sku) {
    return Map.of(sku, stock.getOrDefault(sku, 0));
  }
}
