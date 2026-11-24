package com.example.fulfilment.worker;

public record CreditNoteIssued(String creditNoteId, String orderId, long amountCents) {
}
