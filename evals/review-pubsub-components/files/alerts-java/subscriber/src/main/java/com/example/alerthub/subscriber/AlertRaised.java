package com.example.alerthub.subscriber;

import java.time.Instant;

public record AlertRaised(String alertId, String severity, String message, Instant raisedAt) {
}
