package com.example.shiptrack.subscriber;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * A CloudEvent whose data cannot be bound to the record makes Spring answer 400, which Dapr retries.
 * Answer DROP instead: retrying a malformed message never helps.
 */
@RestControllerAdvice
public class UnreadableEventAdvice {

  private static final Logger logger = LoggerFactory.getLogger(UnreadableEventAdvice.class);

  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<TopicEventStatus> onUnreadable(HttpMessageNotReadableException e) {
    logger.warn("Dropping an event that cannot be read: {}", e.getMostSpecificCause().getMessage());
    return ResponseEntity.ok(TopicEventStatus.DROP);
  }
}
