package com.example.alerthub.subscriber;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Ids of messages that were already processed. Replace with a Dapr state store before production. */
@Component
public class InMemoryProcessedEvents implements ProcessedEvents {

  private final Set<String> processed = ConcurrentHashMap.newKeySet();

  @Override
  public boolean isProcessed(String id) {
    return processed.contains(id);
  }

  @Override
  public void markProcessed(String id) {
    processed.add(id);
  }
}
