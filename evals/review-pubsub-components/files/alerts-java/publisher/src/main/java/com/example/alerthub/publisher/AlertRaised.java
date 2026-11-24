package com.example.alerthub.publisher;

import java.time.Instant;

public record AlertRaised(String alertId, String severity, String message, Instant raisedAt) {
}
