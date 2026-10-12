# local.http

Create a `local.http` file in the project root to test the workflow endpoints:

```http
@host=http://localhost:<app-port>

### Start the workflow
# @name workflowStartRequest
POST {{host}}/start
Content-Type: application/json

{
    "id": "{{$guid}}",
    "message": "Hello Dapr Workflow"
}

### Get the workflow status
@instanceId={{workflowStartRequest.response.body.$.instanceId}}
GET {{host}}/status/{{instanceId}}

### Pause the workflow
POST {{host}}/pause/{{instanceId}}

### Resume the workflow
POST {{host}}/resume/{{instanceId}}

### Terminate the workflow
POST {{host}}/terminate/{{instanceId}}

### Raise an external event (only when the workflow waits for external events)
POST {{host}}/raise-event/{{instanceId}}/<event-name>
Content-Type: application/json

{
    "isApproved": true
}
```

### Key points

- The `<app-port>` must match the port in `launchSettings.json` and, for projects run with the Dapr CLI, the `appPort` in `dapr.yaml`. In an Aspire solution there is no `dapr.yaml`: use the `http` profile port from the ApiService's `Properties/launchSettings.json`.
- The `start` request matches the `MapPost("/start", ...)` endpoint in `Program.cs`. The json payload in the request should match the workflow input record type that uses the `[FromBody]` attribute in `Program.cs`.
- The `instanceId` is extracted from the JSON response body of the `start` request.
- The `status` request matches the `MapGet("/status/{instanceId}", ...)` endpoint in `Program.cs`.
- The `pause`, `resume`, and `terminate` requests match the corresponding `MapPost` endpoints in `Program.cs`.
- Include the `raise-event` request only when the workflow calls `WaitForExternalEventAsync`. Replace `<event-name>` with the event name constant used by the workflow, and make the JSON body match the event payload type (e.g. `ApprovalStatus`).
- Use the VS Code REST Client extension or JetBrains HTTP Client to send requests directly from this file.
