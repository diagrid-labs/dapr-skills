package com.example.shipments;

public record Shipment(String id, String orderReference, String carrier, String destination, String status) {
}
