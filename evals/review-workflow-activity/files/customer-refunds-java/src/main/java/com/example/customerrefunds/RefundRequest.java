package com.example.customerrefunds;

public record RefundRequest(String refundId, String paymentId, String customerEmail, long amount) {
}
