package com.example.insuranceclaims;

public record ClaimRequest(String claimId, String policyNumber, long amount) {
}
