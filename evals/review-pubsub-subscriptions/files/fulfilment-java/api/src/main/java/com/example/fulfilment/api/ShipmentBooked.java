package com.example.fulfilment.api;

public record ShipmentBooked(String shipmentId, String orderId, int weight, boolean cancelled) {
}
