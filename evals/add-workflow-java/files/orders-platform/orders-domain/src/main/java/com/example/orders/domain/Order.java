package com.example.orders.domain;

import java.math.BigDecimal;

public record Order(String id, String customerId, String sku, int quantity, BigDecimal total, String status) {
}
