package com.example.shiptrack.publisher;

import java.time.Instant;

public record ShipmentDispatched(String shipmentId, String carrier, int parcelCount, Instant dispatchedAt) {
}
