package com.example.travelbooking;

import java.util.concurrent.TimeoutException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/trips")
public class TripBookingController {

  private final TripWorkflowService tripWorkflowService;

  public TripBookingController(TripWorkflowService tripWorkflowService) {
    this.tripWorkflowService = tripWorkflowService;
  }

  @PostMapping("/start")
  public ResponseEntity<Void> start(@RequestBody TripRequest request) {
    tripWorkflowService.start(request);
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/start-and-wait")
  public ResponseEntity<StatusResponse> startAndWait(@RequestBody TripRequest request) throws TimeoutException {
    return ResponseEntity.ok(tripWorkflowService.startAndWait(request));
  }

  @GetMapping("/status/{instanceId}")
  public ResponseEntity<StatusResponse> status(@PathVariable String instanceId) {
    StatusResponse status = tripWorkflowService.status(instanceId);
    return status == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(status);
  }

  @PostMapping("/resume/{instanceId}")
  public ResponseEntity<Void> resume(@PathVariable String instanceId) {
    tripWorkflowService.resume(instanceId);
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/terminate/{instanceId}")
  public ResponseEntity<Void> terminate(@PathVariable String instanceId) {
    tripWorkflowService.terminate(instanceId);
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/raise-event/{instanceId}/{eventName}")
  public ResponseEntity<Void> raiseEvent(
      @PathVariable String instanceId, @PathVariable String eventName, @RequestBody Object payload) {
    return tripWorkflowService.raiseEvent(instanceId, eventName, payload)
        ? ResponseEntity.accepted().build()
        : ResponseEntity.notFound().build();
  }
}
