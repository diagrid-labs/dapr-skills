package com.example.fulfilment.api;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class UnreadableEventAdvice {

  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<TopicEventStatus> onUnreadable(HttpMessageNotReadableException e) {
    return ResponseEntity.ok(TopicEventStatus.DROP);
  }
}
