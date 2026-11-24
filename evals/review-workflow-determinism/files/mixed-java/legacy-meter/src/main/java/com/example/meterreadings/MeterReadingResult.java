package com.example.meterreadings;

import java.time.Instant;

public record MeterReadingResult(String meterId, Instant processedAt) {
}
