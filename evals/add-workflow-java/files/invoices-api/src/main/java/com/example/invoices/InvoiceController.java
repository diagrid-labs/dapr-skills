package com.example.invoices;

import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/invoices")
public class InvoiceController {

  private final InvoiceService invoices;

  public InvoiceController(InvoiceService invoices) {
    this.invoices = invoices;
  }

  @PostMapping
  public ResponseEntity<Invoice> issue(@RequestBody Invoice invoice) {
    Invoice issued = invoices.issue(invoice);
    return ResponseEntity.created(URI.create("/invoices/" + issued.id())).body(issued);
  }

  @GetMapping("/{id}")
  public ResponseEntity<Invoice> get(@PathVariable String id) {
    return invoices.find(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
  }
}
