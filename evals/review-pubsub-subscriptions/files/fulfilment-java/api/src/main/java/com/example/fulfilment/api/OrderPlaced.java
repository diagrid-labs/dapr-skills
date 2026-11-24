package com.example.fulfilment.api;

public record OrderPlaced(String orderId, String customerId, int itemCount) {
}
