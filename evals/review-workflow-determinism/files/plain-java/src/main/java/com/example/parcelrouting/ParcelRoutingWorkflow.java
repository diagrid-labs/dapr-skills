package com.example.parcelrouting;

import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.time.Instant;

public class ParcelRoutingWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      Parcel parcel = ctx.getInput(Parcel.class);
      Instant routedAt = Instant.now();
      String depot = ctx.callActivity(AssignDepotActivity.class.getName(), parcel, String.class).await();
      ctx.complete(new RoutingResult(parcel.parcelId(), depot, routedAt));
    };
  }
}
