package com.example.parcelrouting;

import java.time.Instant;

public record RoutingResult(String parcelId, String depot, Instant routedAt) {
}
