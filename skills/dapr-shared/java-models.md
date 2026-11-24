# Models (Java)

Resolve every placeholder from the specification interview before copying this file; the vocabulary is in
[workflow-placeholders.md](workflow-placeholders.md).

Define one top-level `record` per workflow and activity input and output, each in its own file in the
`<javaPackage>` package (`src/main/java/<javaPackage>/`, one folder per package segment). Dapr persists
these values in the workflow history, so they must serialize to JSON and back.

`<WorkflowInput>.java`:

```java
package <javaPackage>;

public record <WorkflowInput>(String id, String message) {
}
```

`<WorkflowOutput>.java`:

```java
package <javaPackage>;

public record <WorkflowOutput>(String result) {
}
```

`<ActivityInput>.java`:

```java
package <javaPackage>;

public record <ActivityInput>(String data) {
}
```

`<ActivityOutput>.java`:

```java
package <javaPackage>;

public record <ActivityOutput>(String processedData) {
}
```

`StatusResponse.java`, the body of the status endpoint:

```java
package <javaPackage>;

public record StatusResponse(String instanceId, String name, String runtimeStatus, <WorkflowOutput> output) {
}
```

### Key points

- Every payload is a top-level `public record` in its own file. Never use a class with getters and setters,
  and never nest a record inside the workflow or activity class.
- Workflow and activity payloads are serialized by the workflow SDK's own Jackson 2 mapper, not by Spring's
  Jackson 3 `JsonMapper`. Use only `com.fasterxml.jackson.annotation` annotations on these records (for
  example `@JsonProperty`), never anything from `tools.jackson`. `java.time` fields such as `Instant` work.
- A record may hold another record, a `List` of records, or `java.time` values.
- Define separate input and output types for the workflow and for each activity, so each contract is clear.
- The id component of `<WorkflowInput>` is the workflow instance id used by the `/start` endpoint. It is `id`
  here; when the user's input names its entity id (`shipmentId`, `loanId`), use that component instead. The
  JSON body of the `start` request in `local.http` must match the `<WorkflowInput>` components.
- `StatusResponse.output` is the workflow output, read with `readOutputAs(<WorkflowOutput>.class)` once the
  workflow has completed, and `null` before that.
