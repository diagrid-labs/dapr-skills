package com.example.fulfilment.worker;

import io.dapr.client.DaprClientBuilder;
import io.dapr.client.DaprPreviewClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class StreamingConfiguration {

  @Bean
  public DaprPreviewClient daprPreviewClient(DaprClientBuilder daprClientBuilder) {
    return daprClientBuilder.buildPreviewClient();
  }
}
