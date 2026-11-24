package com.example.returns;

public record ReturnRequest(String id, String orderId, String reason, String status) {
}
