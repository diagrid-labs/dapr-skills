package com.example.invoices;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class InvoiceService {

  private final Map<String, Invoice> invoices = new ConcurrentHashMap<>();

  public Invoice issue(Invoice invoice) {
    if (invoice.customerEmail() == null || invoice.customerEmail().isBlank()) {
      throw new IllegalArgumentException("customerEmail is required");
    }
    String id = invoice.id() != null ? invoice.id() : UUID.randomUUID().toString();
    Invoice issued = new Invoice(id, invoice.customerEmail(), invoice.amount(), "ISSUED");
    invoices.put(id, issued);
    return issued;
  }

  public Optional<Invoice> find(String id) {
    return Optional.ofNullable(invoices.get(id));
  }
}
