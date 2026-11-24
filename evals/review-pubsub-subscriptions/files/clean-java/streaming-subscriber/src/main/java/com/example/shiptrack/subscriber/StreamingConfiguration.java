package com.example.shiptrack.subscriber;

import io.dapr.client.DaprClientBuilder;
import io.dapr.client.DaprPreviewClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class StreamingConfiguration {

  // DaprPreviewClient is not autoconfigured; build it from the autoconfigured DaprClientBuilder so it
  // uses the same connection settings and serializer as the DaprClient bean.
  @Bean
  public DaprPreviewClient daprPreviewClient(DaprClientBuilder daprClientBuilder) {
    return daprClientBuilder.buildPreviewClient();
  }
}
