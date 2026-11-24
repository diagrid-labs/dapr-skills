package com.example.travelbooking;

import io.dapr.durabletask.TaskCanceledException;
import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class TripBookingWorkflow implements Workflow {

  public static final String APPROVAL_EVENT = "ManagerApproval";

  @Override
  public WorkflowStub create() {
    return ctx -> {
      TripRequest request = ctx.getInput(TripRequest.class);
      TripReserved reserved = ctx.callActivity(
          ReserveTripActivity.class.getName(), request, TripReserved.class).await();

      ManagerApproval approval;
      try {
        approval = ctx.waitForExternalEvent(
            APPROVAL_EVENT, Duration.ofDays(2), ManagerApproval.class).await();
      } catch (TaskCanceledException e) {
        ctx.complete(new TripResult(request.tripId(), "TIMED_OUT"));
        return;
      }

      String outcome = approval.approved() ? "BOOKED " + reserved.reservationCode() : "REJECTED";
      ctx.complete(new TripResult(request.tripId(), outcome));
    };
  }
}
