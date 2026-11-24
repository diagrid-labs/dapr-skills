package com.example.shipments;

import io.dapr.client.DaprClient;
import io.dapr.client.domain.HttpExtension;
import org.springframework.stereotype.Service;

@Service
public class TrackingService {

  private final DaprClient client;

  public TrackingService(DaprClient client) {
    this.client = client;
  }

  public String trackingStatus(String shipmentId) {
    return client.invokeMethod("carrier-tracking", "tracking/" + shipmentId, null, HttpExtension.GET, String.class)
        .block();
  }
}
