package com.example.invoices;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest
@Import(InvoiceService.class)
class InvoiceControllerTest {

  @Autowired
  private MockMvc mvc;

  @Test
  void unknownInvoiceAnswersNotFound() throws Exception {
    mvc.perform(get("/invoices/missing")).andExpect(status().isNotFound());
  }
}
