package com.example.alerthub.subscriber;

public interface ProcessedEvents {

  boolean isProcessed(String id);

  void markProcessed(String id);
}
