package com.example.checkout;

import java.math.BigDecimal;
import java.util.List;

public record OrderPlaced(String orderId, String customerId, List<String> skus, BigDecimal total) {
}
