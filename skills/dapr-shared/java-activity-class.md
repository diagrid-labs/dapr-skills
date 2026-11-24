# Activity Class (Java)

Resolve every placeholder from the specification interview before copying this file; the vocabulary is in
[workflow-placeholders.md](workflow-placeholders.md).

An activity is a top-level Spring `@Component` that implements `io.dapr.workflows.WorkflowActivity`. Its
`run` method receives a `WorkflowActivityContext`, reads the input and returns the output. Activities hold
the business logic and every side effect. Create `src/main/java/<javaPackage>/<ActivityName>.java`:

```java
package <javaPackage>;

import io.dapr.workflows.WorkflowActivity;
import io.dapr.workflows.WorkflowActivityContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class <ActivityName> implements WorkflowActivity {

  private static final Logger logger = LoggerFactory.getLogger(<ActivityName>.class);

  @Override
  public Object run(WorkflowActivityContext ctx) {
    <ActivityInput> input = ctx.getInput(<ActivityInput>.class);
    logger.info("<ActivityName>: {}", input.data());

    // TODO: implement actual functionality

    return new <ActivityOutput>("Processed: " + input.data());
  }
}
```

### Key points

- One top-level `public` class per activity, annotated with `@Component`, never nested in the workflow class.
  `@EnableDaprWorkflows` registers it under its canonical class name, which the workflow passes as
  `<ActivityName>.class.getName()`.
- Read the input with `ctx.getInput(<ActivityInput>.class)` and return the output record from `run`.
- An activity is a normal Spring bean. When it needs a collaborator (a repository, a client for another
  service, another `@Service`), take it as a constructor parameter and keep it in a `private final` field.
  Never use field `@Autowired`.
- Activities are where non-deterministic work and I/O belong: HTTP calls, database queries, file access,
  the current time, random values.
- An exception thrown from `run` fails the activity. With a retry policy the workflow runtime calls the
  activity again, so make activities idempotent; without one the workflow receives a `TaskFailedException`.
- A plain SLF4J logger is fine here: activities are not replayed.
- If the user described the behaviour, implement it in `run`. If it is unclear, keep the
  `// TODO: implement actual functionality` comment.
