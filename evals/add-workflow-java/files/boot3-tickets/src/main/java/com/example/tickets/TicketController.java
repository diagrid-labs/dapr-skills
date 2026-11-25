package com.example.tickets;

import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TicketController {

  @PostMapping("/tickets")
  public Map<String, String> open(@RequestBody Map<String, String> ticket) {
    return Map.of("id", UUID.randomUUID().toString(), "subject", ticket.getOrDefault("subject", ""));
  }
}
