package com.example.warehouserestock;

import java.time.Instant;

public record RestockResult(String sku, String reservationId, String status, Instant receivedAt) {
}
