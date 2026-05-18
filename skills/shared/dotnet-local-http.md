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
    "key1": "value1"
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
```

### Key points

- The `<app-port>` must match the port in `launchSettings.json` and `dapr.yaml`.
- The `start` request matches the `MapPost("/start", ...)` endpoint in `Program.cs`. The json payload in the request should match the workflow input record type that uses the `[FromBody]` attribute in `Program.cs`.
- The `instanceId` is extracted from the JSON response body of the `start` request.
- The `status` request matches the `MapGet("/status/{instanceId}", ...)` endpoint in `Program.cs`.
- The `pause`, `resume`, and `terminate` requests match the corresponding `MapPost` endpoints in `Program.cs`.
- Use the VS Code REST Client extension or JetBrains HTTP Client to send requests directly from this file.
