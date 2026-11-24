package com.example.fulfilment.api;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

@Component
public class OrderBook {

  private final Set<String> knownOrders = ConcurrentHashMap.newKeySet();

  public boolean exists(String orderId) {
    return knownOrders.contains(orderId);
  }
}
