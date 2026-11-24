# Java pub/sub handler

The business logic for every subscription type, plus the response record and the idempotency store.
Resolve every placeholder from the specification interview before copying this file; the vocabulary is in
[pubsub-placeholders.md](pubsub-placeholders.md). All files go in
`subscriber/src/main/java/<javaPackage>/subscriber/`, each type in a file of its own.

## Message record

`<EventName>.java`, the subscriber's copy of the contract. Its components are the same as the publisher's
(see [java-pubsub-publisher.md](java-pubsub-publisher.md) → **Message record**).

```java
package <javaPackage>.subscriber;

public record <EventName>(<EventFields>) {
}
```

## TopicEventStatus

`TopicEventStatus.java`, the body Dapr reads from a single-event subscriber response:

```java
package <javaPackage>.subscriber;

/** The body Dapr reads from a single-event subscriber response: {"status": "SUCCESS" | "RETRY" | "DROP"}. */
public record TopicEventStatus(String status) {

  public static final TopicEventStatus SUCCESS = new TopicEventStatus("SUCCESS");
  public static final TopicEventStatus RETRY = new TopicEventStatus("RETRY");
  public static final TopicEventStatus DROP = new TopicEventStatus("DROP");
}
```

## ProcessedEvents

`ProcessedEvents.java`:

```java
package <javaPackage>.subscriber;

public interface ProcessedEvents {

  boolean isProcessed(String id);

  void markProcessed(String id);
}
```

`InMemoryProcessedEvents.java`:

```java
package <javaPackage>.subscriber;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Ids of messages that were already processed. Replace with a Dapr state store before production. */
@Component
public class InMemoryProcessedEvents implements ProcessedEvents {

  private final Set<String> processed = ConcurrentHashMap.newKeySet();

  @Override
  public boolean isProcessed(String id) {
    return processed.contains(id);
  }

  @Override
  public void markProcessed(String id) {
    processed.add(id);
  }
}
```

## <EventName>Handler

`<EventName>Handler.java`:

```java
package <javaPackage>.subscriber;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class <EventName>Handler {

  private static final Logger logger = LoggerFactory.getLogger(<EventName>Handler.class);

  private final ProcessedEvents processedEvents;

  public <EventName>Handler(ProcessedEvents processedEvents) {
    this.processedEvents = processedEvents;
  }

  /** Returns SUCCESS or DROP. Throws on a transient error so Dapr retries. */
  public TopicEventStatus handle(<EventName> <eventVar>) {
    if (<eventVar> == null || <ValidationCondition>) {
      logger.warn("Dropping invalid <EventDescription> event: {}", <eventVar>);
      return TopicEventStatus.DROP;
    }
    if (processedEvents.isProcessed(<eventVar>.<idField>())) {
      logger.info("<EventDescription> {} was already processed; acknowledging the duplicate", <eventVar>.<idField>());
      return TopicEventStatus.SUCCESS;
    }
    <HandlerBody>
    processedEvents.markProcessed(<eventVar>.<idField>());
    return TopicEventStatus.SUCCESS;
  }

  public void handleDeadLetter(String eventId, Object data) {
    logger.error("Dead-lettered <EventDescription> event {}: {}", eventId, data);
  }
}
```

`<ValidationCondition>` and `<HandlerBody>` come from the interview:

- `<ValidationCondition>` rejects a message that can never be acted on. It always checks that the
  identifying field is present, because the idempotency store is keyed by it:
  `<eventVar>.<idField>() == null || <eventVar>.<idField>().isBlank()`, joined with `||` to any other check
  the domain needs (a quantity that must be positive, a status from a known set).
  The template assumes a `String` id. For a `long` or `UUID` id, convert it with `String.valueOf(...)` for
  `isProcessed` and `markProcessed`, and check it with `== null` instead of `isBlank()`.
- `<HandlerBody>` is what the user said the subscriber should do with the event. When they described no
  action beyond receiving it, log the event at information level with its identifying fields and nothing
  else; never invent a side effect. Work that can fail transiently belongs here and must be allowed to
  throw.

With several events, add one record and one handler class per event and share the single
`ProcessedEvents` store.

## UnreadableEventAdvice

`UnreadableEventAdvice.java`, for the declarative and programmatic subscribers (the streaming subscriber
has no HTTP routes):

```java
package <javaPackage>.subscriber;

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
```

## Key points

These are the responses recorded in [references/java/gotchas.md](references/java/gotchas.md) §1, with the
inbound retry policy from `dapr-pubsub-resiliency.md` (constant 5s, `maxRetries: 5`):

- Success answers 200 with `{"status": "SUCCESS"}`: handled once.
- A transient error throws. Spring answers 500, Dapr delivers the message 6 times (1 + 5 retries, 5s apart)
  and then sends it to the dead-letter topic.
- An invalid message answers 200 with `{"status": "DROP"}`. It is not redelivered: with a dead-letter topic
  on the subscription it is sent there at once. DROP is never "discarded" when a dead-letter topic exists.
- A body that cannot bind to the record answers DROP through `UnreadableEventAdvice`. Without the advice
  Spring answers 400, which Dapr retries for the whole policy before dead-lettering.
- A duplicate (an `<idField>` already processed) answers SUCCESS, so the broker stops redelivering.
- Never answer 404 from a subscription route: Dapr drops the message.
- `RETRY` exists for completeness; throwing is the normal way to ask for a retry.
- Replace `InMemoryProcessedEvents` with a Dapr state store before production; it is lost on restart and
  not shared between replicas.
- The streaming subscriber calls the same `handle(...)`, but the SDK acks every event it hands over, so the
  returned status is only logged there (see
  [java-pubsub-subscriber-streaming.md](java-pubsub-subscriber-streaming.md)).
