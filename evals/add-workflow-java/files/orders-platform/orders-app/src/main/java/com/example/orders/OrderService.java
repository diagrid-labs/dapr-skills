package com.example.orders;

import com.example.orders.domain.Order;
import com.example.orders.domain.OrderRules;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class OrderService {

  private final Map<String, Order> orders = new ConcurrentHashMap<>();

  public Order place(Order order) {
    List<String> violations = OrderRules.violations(order);
    if (!violations.isEmpty()) {
      throw new IllegalArgumentException(String.join(", ", violations));
    }
    String id = UUID.randomUUID().toString();
    Order placed = new Order(id, order.customerId(), order.sku(), order.quantity(), order.total(), "PLACED");
    orders.put(id, placed);
    return placed;
  }

  public Optional<Order> find(String id) {
    return Optional.ofNullable(orders.get(id));
  }
}
