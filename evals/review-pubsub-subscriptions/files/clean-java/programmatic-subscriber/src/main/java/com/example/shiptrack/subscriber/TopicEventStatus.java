package com.example.shiptrack.subscriber;

/** The body Dapr reads from a single-event subscriber response: {"status": "SUCCESS" | "RETRY" | "DROP"}. */
public record TopicEventStatus(String status) {

  public static final TopicEventStatus SUCCESS = new TopicEventStatus("SUCCESS");
  public static final TopicEventStatus RETRY = new TopicEventStatus("RETRY");
  public static final TopicEventStatus DROP = new TopicEventStatus("DROP");
}
