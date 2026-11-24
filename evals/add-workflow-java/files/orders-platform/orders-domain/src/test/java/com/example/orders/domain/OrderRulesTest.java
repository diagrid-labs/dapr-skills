package com.example.orders.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class OrderRulesTest {

  @Test
  void aCompleteOrderHasNoViolations() {
    Order order = new Order("o-1", "c-7", "SKU-1", 2, new BigDecimal("19.90"), null);

    assertThat(OrderRules.violations(order)).isEmpty();
  }

  @Test
  void aMissingSkuAndZeroQuantityAreReported() {
    Order order = new Order("o-2", "c-7", " ", 0, BigDecimal.ZERO, null);

    assertThat(OrderRules.violations(order)).containsExactly("sku is required", "quantity must be positive");
  }
}
