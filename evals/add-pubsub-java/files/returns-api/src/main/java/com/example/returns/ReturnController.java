package com.example.returns;

import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/returns")
public class ReturnController {

  private final ReturnService returns;

  public ReturnController(ReturnService returns) {
    this.returns = returns;
  }

  @PostMapping
  public ResponseEntity<ReturnRequest> request(@RequestBody ReturnRequest request) {
    ReturnRequest saved = returns.request(request);
    return ResponseEntity.created(URI.create("/returns/" + saved.id())).body(saved);
  }

  @GetMapping("/{id}")
  public ResponseEntity<ReturnRequest> get(@PathVariable String id) {
    return returns.find(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
  }
}
