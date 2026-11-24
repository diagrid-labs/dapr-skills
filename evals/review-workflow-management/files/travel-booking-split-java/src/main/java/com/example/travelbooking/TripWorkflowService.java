package com.example.travelbooking;

import io.dapr.workflows.client.DaprWorkflowClient;
import io.dapr.workflows.client.WorkflowRuntimeStatus;
import io.dapr.workflows.client.WorkflowState;
import java.time.Duration;
import java.util.concurrent.TimeoutException;
import org.springframework.stereotype.Service;

@Service
public class TripWorkflowService {

  private final DaprWorkflowClient workflowClient;

  public TripWorkflowService(DaprWorkflowClient workflowClient) {
    this.workflowClient = workflowClient;
  }

  public String start(TripRequest request) {
    return workflowClient.scheduleNewWorkflow(TripBookingWorkflow.class, request, "trip-booking");
  }

  public StatusResponse startAndWait(TripRequest request) throws TimeoutException {
    String instanceId = workflowClient.scheduleNewWorkflow(TripBookingWorkflow.class, request, request.tripId());
    workflowClient.waitForWorkflowCompletion(instanceId, Duration.ofSeconds(90), true);
    return status(instanceId);
  }

  public StatusResponse status(String instanceId) {
    WorkflowState state = workflowClient.getWorkflowState(instanceId, true);
    if (!exists(state)) {
      return null;
    }
    TripResult output = state.getRuntimeStatus() == WorkflowRuntimeStatus.COMPLETED
        ? state.readOutputAs(TripResult.class)
        : null;
    return new StatusResponse(state.getWorkflowId(), state.getName(), state.getRuntimeStatus().name(), output);
  }

  public void resume(String instanceId) {
    workflowClient.resumeWorkflow(instanceId, "Resumed through the API");
  }

  public void terminate(String instanceId) {
    workflowClient.terminateWorkflow(instanceId, null);
  }

  public boolean raiseEvent(String instanceId, String eventName, Object payload) {
    if (!exists(workflowClient.getWorkflowState(instanceId, false))) {
      return false;
    }
    workflowClient.raiseEvent(instanceId, eventName, payload);
    return true;
  }

  // getWorkflowState returns a placeholder state, not null, for an unknown instance id.
  private static boolean exists(WorkflowState state) {
    return state != null && state.getWorkflowId() != null && !state.getWorkflowId().isEmpty();
  }
}
