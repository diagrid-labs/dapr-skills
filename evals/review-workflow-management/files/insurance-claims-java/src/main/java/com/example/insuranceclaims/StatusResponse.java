package com.example.insuranceclaims;

public record StatusResponse(String instanceId, String name, String runtimeStatus, ClaimResult output) {
}
