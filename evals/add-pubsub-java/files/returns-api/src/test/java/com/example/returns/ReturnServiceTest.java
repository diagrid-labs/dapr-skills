package com.example.returns;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ReturnServiceTest {

  private final ReturnService service = new ReturnService();

  @Test
  void requestStoresTheReturnAsRequested() {
    ReturnRequest saved = service.request(new ReturnRequest(null, "o-12", "Wrong size", null));

    assertThat(saved.status()).isEqualTo("REQUESTED");
    assertThat(service.find(saved.id())).contains(saved);
  }

  @Test
  void requestRejectsAReturnWithoutOrderId() {
    assertThatThrownBy(() -> service.request(new ReturnRequest(null, " ", "Damaged", null)))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
