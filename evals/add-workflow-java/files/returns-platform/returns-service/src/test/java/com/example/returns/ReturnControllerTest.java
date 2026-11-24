package com.example.returns;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.dapr.client.DaprClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import reactor.core.publisher.Mono;

@WebMvcTest(ReturnController.class)
class ReturnControllerTest {

  @Autowired
  private MockMvc mvc;

  @MockitoBean
  private DaprClient daprClient;

  @Test
  void postReturnsStoresTheReturnAndAnswersCreated() throws Exception {
    when(daprClient.saveState(eq("returns-store"), eq("r-1"), any())).thenReturn(Mono.empty());

    mvc.perform(post("/returns")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"id\":\"r-1\",\"sku\":\"SKU-9\",\"customerEmail\":\"a@example.com\",\"reason\":\"too small\"}"))
        .andExpect(status().isCreated());

    verify(daprClient).saveState(eq("returns-store"), eq("r-1"), any());
  }

  @Test
  void postReturnsWithoutSkuAnswersBadRequest() throws Exception {
    mvc.perform(post("/returns")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"id\":\"r-2\"}"))
        .andExpect(status().isBadRequest());
  }
}
