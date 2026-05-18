# Management Endpoints Checklist — Python

Apply each rule below to every file in `management_files` produced by `review-detect-target.md` (typically `main.py`).

The reference baseline for the canonical management surface is the `main.py` in [`../create-workflow-python/REFERENCE.md`](../create-workflow-python/REFERENCE.md) and the request shapes in [`python-local-http.md`](python-local-http.md).

## Required endpoint coverage

The application must expose at least:

| Endpoint                              | Purpose                                | Rule for missing  |
| ------------------------------------- | -------------------------------------- | ----------------- |
| `POST /start`                         | Schedule a new workflow instance       | `DWF-MGT-001`     |
| `GET  /status/{instance_id}`          | Read workflow state                    | `DWF-MGT-002`     |
| `POST /terminate/{instance_id}`       | Terminate a running instance           | `DWF-MGT-003`     |
| `POST /pause/{instance_id}`           | Suspend a running instance             | `DWF-MGT-004`     |
| `POST /resume/{instance_id}`          | Resume a suspended instance            | `DWF-MGT-005`     |

If the workflow uses `wait_for_external_event`, additionally require:

| Endpoint                                          | Purpose                                  | Rule for missing  |
| ------------------------------------------------- | ---------------------------------------- | ----------------- |
| `POST /raise-event/{instance_id}/{event_name}`    | Raise an external event into a workflow  | `DWF-MGT-006`     |

## Per-rule heuristics

| Rule id     | Severity | What to detect                                                                                                          | Why it matters                                                                                            | Suggested fix                                                                                  |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| DWF-MGT-001 | critical | No FastAPI/Flask route mapped to `POST /start` calling `schedule_new_workflow`                                            | Without a start endpoint the workflow cannot be invoked over HTTP.                                       | Add a `POST /start` route that calls `dapr_client.schedule_new_workflow(...)`.                 |
| DWF-MGT-002 | critical | No `GET /status/{instance_id}` route calling `get_workflow_state`                                                          | Operators cannot inspect workflow state.                                                                  | Add a `GET /status/{instance_id}` route.                                                       |
| DWF-MGT-003 | critical | No route calling `terminate_workflow`                                                                                      | Stuck workflows cannot be cancelled without redeploying.                                                  | Add a `POST /terminate/{instance_id}` route.                                                   |
| DWF-MGT-004 | warning  | No route calling `pause_workflow`                                                                                          | No way to pause a workflow during incident response.                                                      | Add a `POST /pause/{instance_id}` route.                                                       |
| DWF-MGT-005 | warning  | No route calling `resume_workflow`                                                                                          | Suspended workflows cannot be resumed.                                                                    | Add a `POST /resume/{instance_id}` route.                                                      |
| DWF-MGT-006 | critical | Workflow uses `ctx.wait_for_external_event(...)` but no route calls `raise_workflow_event`                                  | The workflow will hang forever (or until timeout) because nothing can wake it.                            | Add a `POST /raise-event/{instance_id}/{event_name}` route.                                    |
| DWF-MGT-007 | warning  | `/start` route hard-codes the `instance_id` (no value derived from the request)                                             | Concurrent calls clash on the same id; restarts collide with prior runs.                                  | Use the request's `id` field (or generate one outside the workflow).                           |
| DWF-MGT-008 | warning  | `/start` route does not return the `instance_id` in the response body                                                       | Callers cannot poll status.                                                                                | Return `{"instance_id": instance_id}`.                                                         |
| DWF-MGT-009 | warning  | `/status/...` returns 200 even when the state object indicates "not found"                                                  | Clients cannot distinguish "not found" from "completed".                                                  | Raise `HTTPException(status_code=404, ...)` when the instance is missing.                      |
| DWF-MGT-010 | warning  | Mutating routes (`/start`, `/terminate`, `/raise-event`, `/purge`) have no auth dependency                                  | A public route can be abused to spawn or kill workflows.                                                  | Add a FastAPI dependency that enforces auth, or document an upstream gateway.                  |
| DWF-MGT-011 | critical | Route awaits `wait_for_workflow_completion` (or polls `get_workflow_state` in a loop) without a timeout                      | Long-running workflows block the request indefinitely.                                                    | Pass a timeout, or expose status polling instead.                                              |
| DWF-MGT-012 | critical | `purge` route is called without first verifying the workflow is in a terminal state (Completed / Failed / Terminated)        | Purging a running instance silently drops in-flight history.                                              | Either gate purge on the runtime status, or terminate first, then purge.                       |
| DWF-MGT-013 | warning  | Route returns 500 on bad input (missing field, deserialization error)                                                       | Client errors get charged to the server; alerting noise.                                                 | Validate with Pydantic models and let FastAPI return 422 / 400 automatically.                  |
| DWF-MGT-014 | info     | Status response shape exposes raw `state.__dict__` rather than a typed model                                                | Diverging shapes break shared dashboards and tooling; future fields leak.                                | Return a Pydantic response model with the canonical fields.                                    |
| DWF-MGT-015 | info     | Routes lack OpenAPI metadata (`response_model`, `summary`, etc.)                                                            | Reduces discoverability for ops tooling.                                                                  | Annotate routes with `response_model=` and `summary=`.                                         |

## Confidence notes

- DWF-MGT-006 — Only fires if at least one workflow file in `workflow_files` contains `wait_for_external_event`; if the workflow files were not in scope, downgrade to "Please verify".
- DWF-MGT-010 — Many local-dev apps intentionally omit auth; ask the user whether the deployment target is local-only before raising as a critical for production-bound code.
