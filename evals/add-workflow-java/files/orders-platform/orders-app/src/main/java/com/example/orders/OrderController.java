package com.example.orders;

import com.example.orders.domain.Order;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/orders")
public class OrderController {

  private final OrderService orders;

  public OrderController(OrderService orders) {
    this.orders = orders;
  }

  @PostMapping
  public ResponseEntity<Order> place(@RequestBody Order order) {
    Order placed = orders.place(order);
    return ResponseEntity.created(URI.create("/orders/" + placed.id())).body(placed);
  }

  @GetMapping("/{id}")
  public ResponseEntity<Order> get(@PathVariable String id) {
    return orders.find(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
  }
}
