# Management Endpoints Checklist — Java

Apply each rule below to every file in `management_files` produced by `review-detect-target.md` (typically one `@RestController` class that takes `DaprWorkflowClient`).

The reference baseline for the canonical management surface is the controller in [`java-workflow-endpoints.md`](java-workflow-endpoints.md), the `StatusResponse` record in [`java-models.md`](java-models.md) and the request shapes in [`java-local-http.md`](java-local-http.md). SDK paths in the Source column are relative to [dapr/java-sdk](https://github.com/dapr/java-sdk) at tag `v1.19.1`.

## Rule id map

| Rule id | .NET | Python | Java |
| --- | --- | --- | --- |
| DWF-MGT-001 | applies | applies | applies |
| DWF-MGT-002 | applies | applies | applies |
| DWF-MGT-003 | applies | applies | applies |
| DWF-MGT-004 | applies | applies | applies |
| DWF-MGT-005 | applies | applies | applies |
| DWF-MGT-006 | applies | applies | applies |
| DWF-MGT-007 | applies | applies | applies |
| DWF-MGT-008 | applies | applies | applies |
| DWF-MGT-009 | applies | applies | applies |
| DWF-MGT-010 | applies | applies | applies |
| DWF-MGT-011 | applies (critical) | applies (critical) | applies (**warning**: the Java API always takes a timeout) |
| DWF-MGT-012 | applies | applies | applies |
| DWF-MGT-013 | applies | applies | applies |
| DWF-MGT-014 | applies | applies | applies |
| DWF-MGT-015 | applies | applies | applies |
| DWF-MGT-016 | reserved | reserved | applies |
| DWF-MGT-017 | reserved | reserved | applies |

## Required endpoint coverage

The application must expose at least:

| Endpoint | Purpose | Rule for missing |
| --- | --- | --- |
| `POST /start` | Schedule a new workflow instance | `DWF-MGT-001` |
| `GET  /status/{instanceId}` | Read workflow state | `DWF-MGT-002` |
| `POST /terminate/{instanceId}` | Terminate a running instance | `DWF-MGT-003` |
| `POST /pause/{instanceId}` | Suspend a running instance | `DWF-MGT-004` |
| `POST /resume/{instanceId}` | Resume a suspended instance | `DWF-MGT-005` |

If a workflow calls `waitForExternalEvent`, additionally require:

| Endpoint | Purpose | Rule for missing |
| --- | --- | --- |
| `POST /raise-event/{instanceId}/{eventName}` | Raise an external event into a workflow | `DWF-MGT-006` |

Paths may carry a class-level `@RequestMapping` prefix (for example `/workflows/<workflow-route>/start`); the SDK call decides coverage, not the exact path.

## Per-rule heuristics

| Rule id | Severity | What to detect | Why it matters | Suggested fix | Source |
| --- | --- | --- | --- | --- | --- |
| DWF-MGT-001 | critical | No `@PostMapping` (or `@RequestMapping` with `method = RequestMethod.POST`) handler that calls `scheduleNewWorkflow` | Without a start endpoint the workflow cannot be invoked over HTTP. | Add a `POST /start` handler that calls `workflowClient.scheduleNewWorkflow(<WorkflowName>.class, input, input.id())`. | `java-workflow-endpoints.md` |
| DWF-MGT-002 | critical | No `@GetMapping` handler that calls `getWorkflowState` | Operators cannot inspect workflow state. | Add a `GET /status/{instanceId}` handler. | `java-workflow-endpoints.md` |
| DWF-MGT-003 | critical | No handler that calls `terminateWorkflow` | Stuck workflows cannot be cancelled without redeploying. | Add a `POST /terminate/{instanceId}` handler. | `java-workflow-endpoints.md` |
| DWF-MGT-004 | warning | No handler that calls `suspendWorkflow` | No way to pause a workflow during incident response. | Add a `POST /pause/{instanceId}` handler. | `java-workflow-endpoints.md` |
| DWF-MGT-005 | warning | No handler that calls `resumeWorkflow` | Suspended workflows cannot be resumed. | Add a `POST /resume/{instanceId}` handler. | `java-workflow-endpoints.md` |
| DWF-MGT-006 | critical | A workflow calls `ctx.waitForExternalEvent(...)` but no handler calls `raiseEvent` | The workflow waits until its timeout (or forever) because nothing can deliver the event. | Add a `POST /raise-event/{instanceId}/{eventName}` handler that binds the body as `Object` and calls `raiseEvent`. | `java-workflow-endpoints.md`; `references/java/gotchas.md` §7 "Raise-event body" |
| DWF-MGT-007 | warning | The start handler passes a string literal or constant as the instance id (third argument of `scheduleNewWorkflow`, or `NewWorkflowOptions.setInstanceId("...")`) | Concurrent calls clash on the same id, and a new start reuses the id of a completed run. | Use the request's own entity id (`input.id()`), or pass no id (the SDK then generates one). | `references/java/gotchas.md` §7 "Reusing an instance id"; `durabletask-client/src/main/java/io/dapr/durabletask/DurableTaskGrpcClient.java:187-188` |
| DWF-MGT-008 | warning | The start handler does not return the instance id (the value `scheduleNewWorkflow` returns) in the response body, for example `ResponseEntity.accepted().build()` | Callers cannot poll status. | Return `Map.of("instanceId", instanceId)`. | `java-workflow-endpoints.md` |
| DWF-MGT-009 | warning | The status handler returns 200 without checking for `null` **and** for an empty `getWorkflowId()`. A `state == null` check alone does not satisfy the rule. | `getWorkflowState` does not return `null` for an unknown id: it returns a placeholder state with an empty workflow id and name whose runtime status reads `RUNNING`. Clients get 200 "RUNNING" for an id that does not exist. | Treat the state as missing when it is `null` or `getWorkflowId()` is empty, and return `ResponseEntity.notFound().build()` (see `exists(...)` in `java-workflow-endpoints.md`). | `references/java/gotchas.md` §7 "Unknown instance ids" (observed); `sdk-workflows/src/main/java/io/dapr/workflows/client/DaprWorkflowClient.java:329` |
| DWF-MGT-010 | warning | Mutating handlers (start, terminate, pause, resume, raise-event, purge) with no Spring Security configuration (no `spring-boot-starter-security` in `pom.xml`, no `SecurityFilterChain` bean), no `@PreAuthorize` and no `@Secured` | A public endpoint can be abused to start or kill workflows. | Add Spring Security with a `SecurityFilterChain` (or method security with `@PreAuthorize`), or document the upstream gateway that authenticates calls. | `java-workflow-endpoints.md` |
| DWF-MGT-011 | warning | A handler blocks the request thread on `waitForWorkflowCompletion` or `waitForWorkflowStart` with a timeout of 30 seconds or longer, or a timeout taken from the request | The Java API always takes a timeout, so the request cannot hang forever, but a long timeout holds a servlet thread per call and exhausts the pool under load. | Return the instance id and let the caller poll `/status`, or keep the timeout well under 30 seconds and map the `TimeoutException` to 202 with the instance id. | `DaprWorkflowClient.java:493`, `:406` |
| DWF-MGT-012 | warning | `purgeWorkflow` (or the deprecated `purgeInstance`) called without first checking that the instance exists and is in a terminal state, and without handling `StatusRuntimeException` | The runtime only purges instances in a terminal state (`COMPLETED`, `FAILED`, `TERMINATED`) and rejects an unknown or running instance with a gRPC error, which reaches the client as a 500. Purge also removes child workflows. | Read the state first: missing → 404, not `COMPLETED` / `FAILED` / `TERMINATED` → 409 (or terminate first), then purge; or catch `StatusRuntimeException` and map it to a 4xx. Treat a `false` result as not found. | `DaprWorkflowClient.java:684`; runtime behaviour as in `review-management-dotnet.md` DWF-MGT-012 |
| DWF-MGT-013 | warning | Bad input that ends as a 500: a handler dereferences a component of the request body (`input.customer().email()`) or parses a path variable (`Integer.parseInt`, `Enum.valueOf`) with no `@Valid` and no null or format check; or `raiseEvent` called on a path id with no existence check first | Client errors get charged to the server. `raiseEvent` on an unknown id throws `StatusRuntimeException: UNKNOWN: no such instance exists`, an unhandled 500. | Validate with `@Valid` and Bean Validation, or check and return `ResponseEntity.badRequest()`; check the instance with `getWorkflowState` before `raiseEvent` and return 404. | `references/java/gotchas.md` §7 "Unknown instance ids" (observed) |
| DWF-MGT-014 | info | The status response shape differs from the canonical `StatusResponse(instanceId, name, runtimeStatus, output)` record, for example it returns the raw `WorkflowState` or a hand-built `Map` | Diverging shapes break shared dashboards and tooling; serializing `WorkflowState` directly exposes SDK internals. | Return the `StatusResponse` record from `java-models.md`, with `output` read by `readOutputAs(...)` once the run is `COMPLETED`. | `java-models.md`; `java-workflow-endpoints.md` |
| DWF-MGT-015 | info | The controller has no springdoc `@Operation` / `@ApiResponse` annotations | Reduces discoverability for ops tooling. | Add `springdoc-openapi-starter-webmvc-ui` and annotate the handlers with `@Operation` and `@ApiResponse`. | — |
| DWF-MGT-016 | warning | `getInstanceState\(`, `waitForInstanceStart\(`, `waitForInstanceCompletion\(`, `purgeInstance\(` | These `DaprWorkflowClient` methods are deprecated for removal in SDK 1.19 and return the deprecated `WorkflowInstanceStatus`. | Use `getWorkflowState`, `waitForWorkflowStart`, `waitForWorkflowCompletion` and `purgeWorkflow`. | `DaprWorkflowClient.java:313`, `:377`, `:463`, `:564` |
| DWF-MGT-017 | warning | `new DaprWorkflowClient\(` outside a `@Bean` method (a field initializer, a constructor, a handler) | The starter already declares a `DaprWorkflowClient` bean built from the Dapr connection properties. A hand-built client ignores them, opens its own gRPC channel, and is never closed. | Take the autoconfigured bean as a constructor parameter in a `private final` field. | `references/java/gotchas.md` §9 "Where `DaprWorkflowClient` comes from"; `dapr-spring/dapr-spring-boot-autoconfigure/src/main/java/io/dapr/spring/boot/autoconfigure/client/DaprClientAutoConfiguration.java:107-109` |

## Confidence notes

- DWF-MGT-006 — Only fires if at least one file in `workflow_files` calls `waitForExternalEvent`; if the workflow files were not in scope, downgrade to "Please verify". Cite the controller's class declaration line.
- DWF-MGT-009 — The `exists(...)` helper of `java-workflow-endpoints.md` (`state != null && state.getWorkflowId() != null && !state.getWorkflowId().isEmpty()`) satisfies the rule.
- DWF-MGT-010 — Many local-dev apps intentionally omit auth; ask the user whether the deployment target is local-only. If it is, do not report the finding; otherwise, or when no answer is available, report it as a warning, which is its declared severity. Report it once, at the first mutating handler.
- DWF-MGT-011 — A timeout under 30 seconds that is a constant is not reported. The deprecated `waitForInstanceStart` / `waitForInstanceCompletion` are reported as DWF-MGT-016, and also as this rule when their timeout qualifies.
- DWF-MGT-012 — Treat as satisfied if the handler checks the state first (404 for a missing instance, 409 for a non-terminal status) or wraps the purge in a `try` / `catch (StatusRuntimeException e)` that maps the error to a 4xx. A `purgeInstance` call is reported under both DWF-MGT-012 and DWF-MGT-016 when it is unchecked.
- DWF-MGT-013 — Binding the body to a record with `@RequestBody` and passing its id straight to `scheduleNewWorkflow` is fine: malformed JSON is a 400 from Spring, and a `null` id makes the SDK generate one. Only flag a dereference or parse that can throw.
- DWF-MGT-015 — Report once per controller, at its class declaration line.
- DWF-MGT-017 — Report the `new DaprWorkflowClient(` line. A `@Bean` method that returns `new DaprWorkflowClient(...)` is not this rule: it replaces the autoconfigured bean (`@ConditionalOnMissingBean`, `DaprClientAutoConfiguration.java:107-109`), and the replacement loses the connection settings from the `dapr.client.*` properties and the observation wrapper. Report it under Please verify, at the `new DaprWorkflowClient(` line, asking whether the replacement is intended.
