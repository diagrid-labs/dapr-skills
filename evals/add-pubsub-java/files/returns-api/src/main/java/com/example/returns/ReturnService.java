package com.example.returns;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

@Service
public class ReturnService {

  private final Map<String, ReturnRequest> returns = new ConcurrentHashMap<>();

  public ReturnRequest request(ReturnRequest request) {
    if (request.orderId() == null || request.orderId().isBlank()) {
      throw new IllegalArgumentException("orderId is required");
    }
    String id = UUID.randomUUID().toString();
    ReturnRequest saved = new ReturnRequest(id, request.orderId(), request.reason(), "REQUESTED");
    returns.put(id, saved);
    return saved;
  }

  public Optional<ReturnRequest> find(String id) {
    return Optional.ofNullable(returns.get(id));
  }
}
