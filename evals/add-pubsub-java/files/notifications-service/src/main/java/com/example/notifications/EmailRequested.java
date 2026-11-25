package com.example.notifications;

public record EmailRequested(String requestId, String to, String subject, String body) {
}
