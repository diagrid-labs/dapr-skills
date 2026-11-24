# Java SDK Data Handling

## Overview

Every workflow input, workflow output, activity input, activity output and external event payload is
serialized to JSON and stored in the workflow history. In a Spring Boot app two Jackson versions are on the
classpath, and they do different jobs:

| What | Serialized by |
|---|---|
| Workflow and activity payloads, external event payloads, `readOutputAs` | the workflow SDK's own static **Jackson 2** mapper (`com.fasterxml.jackson`, with `findAndAddModules()`) |
| HTTP request and response bodies of the controller | Spring Boot 4's **Jackson 3** `JsonMapper` (`tools.jackson`) |

The reference build resolved Jackson 2.21.7 (with `jackson-datatype-jsr310`) and Jackson 3.1.5. Details:
[gotchas.md](gotchas.md) §4.

## Rule 1: top-level records

Use a top-level `public record`, in its own file, for every payload. Never a class with getters and setters,
and never a record nested in the workflow or activity class.

```java
public record ResizedImage(String imageId, long bytes) {
}
```

Verified to round-trip, as workflow input, activity output, activity input holding another record, external
event payload, and workflow output read with `readOutputAs`.

## Rule 2: Jackson 2 annotations only

Payloads go through the Jackson 2 mapper, so annotate them, when you must, only with
`com.fasterxml.jackson.annotation` annotations, which both Jackson versions read. Nothing from `tools.jackson`:
the workflow SDK does not see it.

```java
import com.fasterxml.jackson.annotation.JsonProperty;

public record ApprovalDecision(@JsonProperty("is_approved") boolean approved, String approver) {
}
```

Prefer no annotations at all: the record component names are the JSON property names on both sides.

## Supported field types

- Strings, numbers, booleans, enums.
- `java.time` types (`Instant`, `LocalDate`, `Duration`): the SDK's mapper registers the JSR-310 module.
- Other records, and `List` / `Map` of them.

## Reading results

```java
ResizedImage image = ctx.callActivity(
    ResizeImageActivity.class.getName(), imageId, ResizedImage.class).await();
```

The last argument of `callActivity`, `callChildWorkflow` and `waitForExternalEvent` is the class the result is
deserialized into. Pass the record type, never `Object.class` or `Map.class`, so the workflow works with typed
values.

On the client side, `WorkflowState.readOutputAs(<Output>.class)` and `readInputAs(<Input>.class)` use the same
Jackson 2 mapper. `getSerializedOutput()` returns the raw JSON string.

## Generic collections

A `Class` argument cannot carry a type parameter, so `List<ResizedImage>` cannot be read directly as an activity
result. Wrap it in a record:

```java
public record ResizedImages(List<ResizedImage> images) {
}
```

## The raise-event body

The `/raise-event` endpoint binds the request body as `Object` (Spring turns it into a `Map`) and passes it to
`raiseEvent`. The workflow deserializes it into the record it passes to `waitForExternalEvent`, so one
endpoint serves every event.

## Payload size

The whole history is loaded on every replay, and it lives in the state store. Keep payloads small: pass ids and
references, and store large documents or files elsewhere (the state store through `DaprClient`, object
storage), with an activity that saves them and returns the key.

## Sensitive data

Payloads are stored in clear text in the state store and show up in the Dev Dashboard. Pass a reference to
secrets or personal data, not the value.
