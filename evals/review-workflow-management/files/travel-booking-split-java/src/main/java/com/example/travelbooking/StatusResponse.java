package com.example.travelbooking;

public record StatusResponse(String instanceId, String name, String runtimeStatus, TripResult output) {
}
