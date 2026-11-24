package com.example.orders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.orders.domain.Order;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class OrderServiceTest {

  private final OrderService service = new OrderService();

  @Test
  void placeStoresTheOrderAsPlaced() {
    Order placed = service.place(new Order(null, "c-7", "SKU-1", 1, new BigDecimal("9.95"), null));

    assertThat(placed.status()).isEqualTo("PLACED");
    assertThat(service.find(placed.id())).contains(placed);
  }

  @Test
  void placeRejectsAnInvalidOrder() {
    assertThatThrownBy(() -> service.place(new Order(null, "c-7", "SKU-1", 0, BigDecimal.ZERO, null)))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
