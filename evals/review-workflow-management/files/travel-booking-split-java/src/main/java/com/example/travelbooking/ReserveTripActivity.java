package com.example.travelbooking;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class ReserveTripActivity implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(ReserveTripActivity.class);

  @Override
  public Object run(WorkflowActivityContext ctx) {
    TripRequest input = ctx.getInput(TripRequest.class);
    logger.info("ReserveTripActivity: {}", input.tripId());
    return new TripReserved(input.tripId(), "R-" + input.tripId());
  }
}
