package com.example.claims;

import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/claims")
public class ClaimController {

  private final ClaimService claims;

  public ClaimController(ClaimService claims) {
    this.claims = claims;
  }

  @PostMapping
  public ResponseEntity<Claim> submit(@RequestBody Claim claim) {
    Claim submitted = claims.submit(claim);
    return ResponseEntity.created(URI.create("/claims/" + submitted.id())).body(submitted);
  }

  @GetMapping("/{id}")
  public ResponseEntity<Claim> get(@PathVariable String id) {
    return claims.find(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
  }
}
