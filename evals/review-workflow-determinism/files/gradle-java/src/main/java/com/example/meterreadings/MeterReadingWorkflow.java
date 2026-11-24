package com.example.meterreadings;

import io.dapr.workflows.Workflow;
import io.dapr.workflows.WorkflowStub;
import java.time.Instant;
import org.springframework.stereotype.Component;

@Component
public class MeterReadingWorkflow implements Workflow {

  @Override
  public WorkflowStub create() {
    return ctx -> {
      MeterReading reading = ctx.getInput(MeterReading.class);
      Instant processedAt = Instant.now();
      ctx.complete(new MeterReadingResult(reading.meterId(), processedAt));
    };
  }
}
