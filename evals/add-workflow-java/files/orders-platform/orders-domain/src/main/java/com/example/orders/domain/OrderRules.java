package com.example.orders.domain;

import java.util.ArrayList;
import java.util.List;

public final class OrderRules {

  private OrderRules() {
  }

  public static List<String> violations(Order order) {
    List<String> violations = new ArrayList<>();
    if (order.customerId() == null || order.customerId().isBlank()) {
      violations.add("customerId is required");
    }
    if (order.sku() == null || order.sku().isBlank()) {
      violations.add("sku is required");
    }
    if (order.quantity() <= 0) {
      violations.add("quantity must be positive");
    }
    return violations;
  }
}
