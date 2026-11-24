package com.example.customerrefunds;

public record LedgerEntry(String refundId, long amount, String transactionId) {
}
