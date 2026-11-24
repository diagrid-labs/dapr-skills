package com.example.documentapproval;

import io.dapr.workflows.client.DaprWorkflowClient;
import io.dapr.workflows.client.WorkflowRuntimeStatus;
import io.dapr.workflows.client.WorkflowState;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DocumentApprovalWorkflowController {

  private final DaprWorkflowClient workflowClient;

  public DocumentApprovalWorkflowController(DaprWorkflowClient workflowClient) {
    this.workflowClient = workflowClient;
  }

  @PostMapping("/start")
  public Map<String, String> start(@RequestBody ApprovalRequest input) {
    String instanceId = workflowClient.scheduleNewWorkflow(DocumentApprovalWorkflow.class, input, input.documentId());
    return Map.of("instanceId", instanceId);
  }

  @GetMapping("/status/{instanceId}")
  public ResponseEntity<?> status(@PathVariable String instanceId) {
    WorkflowState state = workflowClient.getWorkflowState(instanceId, true);
    if (!exists(state)) {
      return ResponseEntity.notFound().build();
    }
    ApprovalResult output = state.getRuntimeStatus() == WorkflowRuntimeStatus.COMPLETED
        ? state.readOutputAs(ApprovalResult.class)
        : null;
    return ResponseEntity.ok(new StatusResponse(
        state.getWorkflowId(), state.getName(), state.getRuntimeStatus().name(), output));
  }

  @PostMapping("/pause/{instanceId}")
  public ResponseEntity<Void> pause(@PathVariable String instanceId) {
    workflowClient.suspendWorkflow(instanceId, "Paused through the API");
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/resume/{instanceId}")
  public ResponseEntity<Void> resume(@PathVariable String instanceId) {
    workflowClient.resumeWorkflow(instanceId, "Resumed through the API");
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/terminate/{instanceId}")
  public ResponseEntity<Void> terminate(@PathVariable String instanceId) {
    workflowClient.terminateWorkflow(instanceId, null);
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/raise-event/{instanceId}/{eventName}")
  public ResponseEntity<?> raiseEvent(
      @PathVariable String instanceId, @PathVariable String eventName, @RequestBody Object payload) {
    WorkflowState state = workflowClient.getWorkflowState(instanceId, false);
    if (!exists(state)) {
      return ResponseEntity.notFound().build();
    }
    workflowClient.raiseEvent(instanceId, eventName, payload);
    return ResponseEntity.accepted().build();
  }

  // getWorkflowState returns a placeholder state, not null, for an unknown instance id:
  // its workflow id and name are empty and its runtime status reads RUNNING.
  private static boolean exists(WorkflowState state) {
    return state != null && state.getWorkflowId() != null && !state.getWorkflowId().isEmpty();
  }
}
