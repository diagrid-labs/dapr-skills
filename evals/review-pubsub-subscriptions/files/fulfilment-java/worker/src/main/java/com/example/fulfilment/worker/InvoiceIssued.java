package com.example.fulfilment.worker;

public record InvoiceIssued(String invoiceId, String orderId, long amountCents) {
}
