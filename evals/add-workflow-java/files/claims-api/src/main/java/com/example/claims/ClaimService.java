package com.example.claims;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class ClaimService {

  private final Map<String, Claim> claims = new ConcurrentHashMap<>();

  public Claim submit(Claim claim) {
    if (claim.policyNumber() == null || claim.policyNumber().isBlank()) {
      throw new IllegalArgumentException("policyNumber is required");
    }
    String id = claim.id() != null ? claim.id() : UUID.randomUUID().toString();
    Claim submitted = new Claim(id, claim.policyNumber(), claim.description(), claim.amount(), "SUBMITTED");
    claims.put(id, submitted);
    return submitted;
  }

  public Optional<Claim> find(String id) {
    return Optional.ofNullable(claims.get(id));
  }
}
