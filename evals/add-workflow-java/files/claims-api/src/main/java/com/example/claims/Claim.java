package com.example.claims;

import java.math.BigDecimal;

public record Claim(String id, String policyNumber, String description, BigDecimal amount, String status) {
}
