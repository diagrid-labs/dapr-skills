package com.example.insuranceclaims;

import io.dapr.workflows.client.DaprWorkflowClient;
import io.dapr.workflows.client.WorkflowRuntimeStatus;
import io.dapr.workflows.client.WorkflowState;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.TimeoutException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ClaimController {

  private final DaprWorkflowClient workflowClient = new DaprWorkflowClient();

  @PostMapping("/start")
  public ResponseEntity<Void> start(@RequestBody ClaimRequest claim) {
    workflowClient.scheduleNewWorkflow(ClaimWorkflow.class, claim, "insurance-claim");
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/start-and-wait")
  public ResponseEntity<?> startAndWait(@RequestBody ClaimRequest claim) throws TimeoutException {
    String instanceId = workflowClient.scheduleNewWorkflow(ClaimWorkflow.class, claim, claim.claimId());
    WorkflowState state = workflowClient.waitForWorkflowCompletion(instanceId, Duration.ofSeconds(60), true);
    String status = state == null ? "UNKNOWN" : state.getRuntimeStatus().name();
    return ResponseEntity.ok(Map.of("instanceId", instanceId, "status", status));
  }

  @GetMapping("/status/{instanceId}")
  public ResponseEntity<?> status(@PathVariable String instanceId) {
    WorkflowState state = workflowClient.getWorkflowState(instanceId, true);
    if (state == null) {
      return ResponseEntity.notFound().build();
    }
    ClaimResult output = state.getRuntimeStatus() == WorkflowRuntimeStatus.COMPLETED
        ? state.readOutputAs(ClaimResult.class)
        : null;
    return ResponseEntity.ok(new StatusResponse(
        state.getWorkflowId(), state.getName(), state.getRuntimeStatus().name(), output));
  }

  @PostMapping("/pause/{instanceId}")
  public ResponseEntity<Void> pause(@PathVariable String instanceId) {
    workflowClient.suspendWorkflow(instanceId, "Paused through the API");
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/terminate/{instanceId}")
  public ResponseEntity<Void> terminate(@PathVariable String instanceId) {
    workflowClient.terminateWorkflow(instanceId, null);
    return ResponseEntity.accepted().build();
  }

  @DeleteMapping("/purge/{instanceId}")
  public ResponseEntity<Void> purge(@PathVariable String instanceId) {
    workflowClient.purgeInstance(instanceId);
    return ResponseEntity.noContent().build();
  }
}
