package com.example.warehouserestock;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class InventoryService {

  private final Map<String, Integer> levels = new ConcurrentHashMap<>();

  public int currentLevel(String sku) {
    return levels.getOrDefault(sku, 0);
  }

  public String reserve(String sku, int quantity) {
    levels.merge(sku, -quantity, Integer::sum);
    return sku + "-" + quantity;
  }
}
