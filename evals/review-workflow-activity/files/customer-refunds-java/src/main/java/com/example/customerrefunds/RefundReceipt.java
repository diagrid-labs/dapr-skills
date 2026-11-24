package com.example.customerrefunds;

import java.time.Instant;
import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record RefundReceipt(String refundId, String customerEmail, Instant issuedAt) {
}
