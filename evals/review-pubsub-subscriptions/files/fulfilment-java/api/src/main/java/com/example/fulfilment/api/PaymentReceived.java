package com.example.fulfilment.api;

public record PaymentReceived(String paymentId, String orderId, long amount, String currency) {
}
