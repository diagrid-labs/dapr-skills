package com.example.shiptrack.subscriber;

public interface ProcessedEvents {

  boolean isProcessed(String id);

  void markProcessed(String id);
}
