package com.example.catalog;

import java.math.BigDecimal;

public record Product(String sku, String name, BigDecimal price) {
}
