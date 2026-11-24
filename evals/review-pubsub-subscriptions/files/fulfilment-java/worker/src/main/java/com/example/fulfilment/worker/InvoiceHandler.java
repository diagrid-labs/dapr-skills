package com.example.fulfilment.worker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class InvoiceHandler {

  private static final Logger logger = LoggerFactory.getLogger(InvoiceHandler.class);

  /** Throws when the ledger is not ready, so the caller can decide what to do. */
  public void handle(InvoiceIssued invoice) {
    if (invoice.orderId() == null) {
      throw new IllegalStateException("Invoice " + invoice.invoiceId() + " has no order yet");
    }
    logger.info("Invoice {} of {} cents for order {}", invoice.invoiceId(), invoice.amountCents(), invoice.orderId());
  }
}
