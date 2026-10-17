# Management Endpoints Checklist — .NET (and Aspire)

Apply each rule below to every file in `management_files` produced by `review-detect-target.md` (typically `Program.cs`, or in Aspire solutions the ApiService's `Program.cs`).

The reference baseline for the canonical management surface is the `Program.cs` in [the canonical endpoints in `dotnet-workflow-endpoints.md`](../dapr-shared/dotnet-workflow-endpoints.md) and the request shapes in [`dotnet-local-http.md`](dotnet-local-http.md).

## Required endpoint coverage

The application must expose at least:

| Endpoint                            | Purpose                                | Rule for missing  |
| ----------------------------------- | -------------------------------------- | ----------------- |
| `POST /start`                       | Schedule a new workflow instance       | `DWF-MGT-001`     |
| `GET  /status/{instanceId}`         | Read workflow state                    | `DWF-MGT-002`     |
| `POST /terminate/{instanceId}`      | Terminate a running instance           | `DWF-MGT-003`     |
| `POST /pause/{instanceId}`          | Suspend a running instance             | `DWF-MGT-004`     |
| `POST /resume/{instanceId}`         | Resume a suspended instance            | `DWF-MGT-005`     |

If the workflow uses `WaitForExternalEventAsync`, additionally require:

| Endpoint                                       | Purpose                                  | Rule for missing  |
| ---------------------------------------------- | ---------------------------------------- | ----------------- |
| `POST /raise-event/{instanceId}/{eventName}`   | Raise an external event into a workflow  | `DWF-MGT-006`     |

## Per-rule heuristics

| Rule id     | Severity | What to detect                                                                                                          | Why it matters                                                                                            | Suggested fix                                                                                  |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| DWF-MGT-001 | critical | No `MapPost("/start"` (or equivalent) calling `ScheduleNewWorkflowAsync`                                                  | Without a start endpoint the workflow cannot be invoked over HTTP.                                       | Add a `POST /start` endpoint that calls `workflowClient.ScheduleNewWorkflowAsync(...)`.        |
| DWF-MGT-002 | critical | No `MapGet("/status/{instanceId}"` (or equivalent) calling `GetWorkflowStateAsync`                                        | Operators cannot inspect workflow state.                                                                  | Add a `GET /status/{instanceId}` endpoint.                                                     |
| DWF-MGT-003 | critical | No endpoint calling `TerminateWorkflowAsync`                                                                              | Stuck workflows cannot be cancelled without redeploying.                                                  | Add a `POST /terminate/{instanceId}` endpoint.                                                 |
| DWF-MGT-004 | warning  | No endpoint calling `SuspendWorkflowAsync`                                                                                | No way to pause a workflow during incident response.                                                      | Add a `POST /pause/{instanceId}` endpoint.                                                     |
| DWF-MGT-005 | warning  | No endpoint calling `ResumeWorkflowAsync`                                                                                  | Suspended workflows cannot be resumed.                                                                    | Add a `POST /resume/{instanceId}` endpoint.                                                    |
| DWF-MGT-006 | critical | Workflow uses `WaitForExternalEventAsync` but no endpoint calls `RaiseEventAsync`                                          | The workflow will hang forever (or until timeout) because nothing can wake it.                            | Add a `POST /raise-event/{instanceId}/{eventName}` endpoint that calls `RaiseEventAsync`.      |
| DWF-MGT-007 | warning  | `/start` endpoint hard-codes the `instanceId` (no `Guid` / no client-provided id)                                          | Concurrent calls clash on the same id; restarts collide with prior runs.                                  | Generate a fresh id (`Guid.NewGuid()` *outside* the workflow) or accept one from the request.  |
| DWF-MGT-008 | warning  | `/start` endpoint does not return the `instanceId` in the response body                                                    | Callers cannot poll status.                                                                                | Return `Results.Ok(new { instanceId })`.                                                       |
| DWF-MGT-009 | warning | `/status/...` returns 200 without checking `state.Exists`. A `state is null` check alone does not satisfy the rule: `GetWorkflowStateAsync` never returns `null`; for unknown instances it returns a state with `Exists == false`. | Clients cannot distinguish "not found" from "completed". | Return `Results.NotFound(...)` when `!state.Exists`. |
| DWF-MGT-010 | warning  | Mutating endpoints (`/start`, `/terminate`, `/raise-event`, `/purge`) have no auth check (no `RequireAuthorization`, no API key) | A public endpoint can be abused to spawn or kill workflows.                                            | Add `.RequireAuthorization()` or an explicit auth check; document the auth model.              |
| DWF-MGT-011 | critical | Endpoint awaits `WaitForWorkflowCompletionAsync` (or `WaitForWorkflowStartAsync`) without a `CancellationToken` that carries a timeout (`new CancellationTokenSource(TimeSpan)` or `CancelAfter`) | Long-running workflows block the HTTP request indefinitely and exhaust the connection pool. | Pass a `CancellationToken` with a finite timeout, or expose status polling instead. |
| DWF-MGT-012 | warning | `purge` endpoint calls `PurgeInstanceAsync` without first checking the instance (`GetWorkflowStateAsync` → `Exists` / `IsWorkflowCompleted`) and without handling `RpcException` | The runtime only purges instances in a terminal state (Completed, Failed, Terminated). For an unknown or still-running instance it returns a gRPC error, which `PurgeInstanceAsync` surfaces as an `RpcException` — an unhandled 500 instead of a 404/409. Purge also deletes all child workflows recursively. | Check the state first: `!state.Exists` → `Results.NotFound(...)`, `!state.IsWorkflowCompleted` → `Results.Conflict(...)` (or terminate first), then purge; alternatively catch `RpcException`. Treat a `false` result (nothing deleted) as not found. |
| DWF-MGT-013 | warning  | Endpoint returns 500 on bad input (e.g., missing field, deserialization error)                                              | Client errors get charged to the server; alerting noise.                                                 | Validate input before calling `ScheduleNewWorkflowAsync` and return `Results.BadRequest(...)`. |
| DWF-MGT-014 | info     | Status response shape differs from the canonical `{ state, output }` envelope                                               | Diverging response shapes break shared dashboards and tooling.                                            | Match the envelope used in `dapr-shared/dotnet-workflow-endpoints.md`.                              |
| DWF-MGT-015 | info     | Endpoints lack OpenAPI / Swagger metadata (`WithName`, `Produces<T>`, etc.)                                                 | Reduces discoverability for ops tooling.                                                                  | Annotate routes with `WithName` and `Produces<T>`.                                             |

## Purge behaviour note

- DWF-MGT-012 — Checking only the `bool` returned by `PurgeInstanceAsync` is not enough: with Dapr 1.18 the runtime (durabletask-go `purgeWorkflowState`) returns an error for missing or non-terminal instances, so the call throws `RpcException` before a `bool` is returned. A state check before the purge, or a `catch (RpcException)`, satisfies the rule.

## Aspire-specific notes

In Aspire solutions:

- The endpoints live in the `*.ApiService` project, not the AppHost.
- Service-to-service auth is typically wired through Aspire's resource references; treat that as an acceptable answer for `DWF-MGT-010` if the route is documented as internal-only.
- The AppHost should reference the ApiService and the Dapr sidecar; verify the sidecar is wired with `WithDaprSidecar()`.

## Confidence notes

- DWF-MGT-006 — Only fires if at least one workflow file in `workflow_files` contains `WaitForExternalEventAsync`; if the workflow files were not in scope, downgrade to "Please verify".
- DWF-MGT-010 — Many local-dev apps intentionally omit auth; ask the user whether the deployment target is local-only. If it is, do not report the finding; otherwise, or when no answer is available, report it as a warning, which is its declared severity.
