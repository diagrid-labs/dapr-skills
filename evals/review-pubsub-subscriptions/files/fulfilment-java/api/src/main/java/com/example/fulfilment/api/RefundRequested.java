package com.example.fulfilment.api;

public record RefundRequested(String refundId, String orderId, long amountCents) {
}
