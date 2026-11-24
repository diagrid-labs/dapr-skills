package com.example.warehouserestock;

import io.dapr.workflows.client.DaprWorkflowClient;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RestockController {

  private final DaprWorkflowClient workflowClient;

  public RestockController(DaprWorkflowClient workflowClient) {
    this.workflowClient = workflowClient;
  }

  @PostMapping("/start")
  public Map<String, String> start(@RequestBody RestockRequest request) {
    String instanceId = workflowClient.scheduleNewWorkflow(
        RestockWorkflow.class, request, "restock-" + UUID.randomUUID());
    return Map.of("instanceId", instanceId);
  }
}
