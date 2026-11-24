package com.example.documentapproval;

public record StatusResponse(String instanceId, String name, String runtimeStatus, ApprovalResult output) {
}
