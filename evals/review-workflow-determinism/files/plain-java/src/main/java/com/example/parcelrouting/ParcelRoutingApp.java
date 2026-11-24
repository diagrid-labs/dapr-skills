package com.example.parcelrouting;

import io.dapr.workflows.runtime.WorkflowRuntime;
import io.dapr.workflows.runtime.WorkflowRuntimeBuilder;

public class ParcelRoutingApp {

  public static void main(String[] args) {
    WorkflowRuntimeBuilder builder = new WorkflowRuntimeBuilder().registerWorkflow(ParcelRoutingWorkflow.class);
    builder.registerActivity(AssignDepotActivity.class);

    try (WorkflowRuntime runtime = builder.build()) {
      runtime.start(true);
    }
  }
}
