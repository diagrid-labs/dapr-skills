package com.example.parcelrouting;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;

public class AssignDepotActivity implements WorkflowActivity {

  @Override
  public Object run(WorkflowActivityContext ctx) {
    Parcel parcel = ctx.getInput(Parcel.class);
    return parcel.postcode().startsWith("1") ? "depot-north" : "depot-south";
  }
}
