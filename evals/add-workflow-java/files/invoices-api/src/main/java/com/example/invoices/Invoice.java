package com.example.invoices;

import java.math.BigDecimal;

public record Invoice(String id, String customerEmail, BigDecimal amount, String status) {
}
