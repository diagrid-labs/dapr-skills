package com.example.checkout;

import io.dapr.client.DaprClient;
import io.dapr.client.DaprClientBuilder;
import io.dapr.client.DaprPreviewClient;
import io.dapr.spring.boot.properties.pubsub.DaprPubSubProperties;
import io.dapr.spring.messaging.DaprMessagingTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MessagingConfiguration {

  @Bean
  public DaprMessagingTemplate<OrderPlaced> orderTemplate(DaprClient daprClient, DaprPubSubProperties properties) {
    return new DaprMessagingTemplate<>(daprClient, properties.getName(), false);
  }

  @Bean
  public DaprPreviewClient daprPreviewClient(DaprClientBuilder daprClientBuilder) {
    return daprClientBuilder.buildPreviewClient();
  }
}
