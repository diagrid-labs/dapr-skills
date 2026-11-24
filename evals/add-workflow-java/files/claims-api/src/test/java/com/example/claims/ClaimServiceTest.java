package com.example.claims;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class ClaimServiceTest {

  private final ClaimService service = new ClaimService();

  @Test
  void submitStoresTheClaimAsSubmitted() {
    Claim submitted = service.submit(new Claim("c-1", "POL-42", "Hail damage", new BigDecimal("1200.00"), null));

    assertThat(submitted.status()).isEqualTo("SUBMITTED");
    assertThat(service.find("c-1")).contains(submitted);
  }

  @Test
  void submitRejectsAClaimWithoutPolicyNumber() {
    assertThatThrownBy(() -> service.submit(new Claim("c-2", " ", "Broken window", BigDecimal.TEN, null)))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
