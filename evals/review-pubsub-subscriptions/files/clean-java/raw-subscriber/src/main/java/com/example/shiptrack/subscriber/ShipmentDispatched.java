package com.example.shiptrack.subscriber;

import java.time.Instant;

public record ShipmentDispatched(String shipmentId, String carrier, int parcelCount, Instant dispatchedAt) {
}
