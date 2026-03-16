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
@instanceId={{workflowStartRequest.response.headers.location}}
GET {{host}}/status?instanceId={{instanceId}}
```

### Key points

- The `<app-port>` must match the port in `launchSettings.json` and `dapr.yaml`.
- The `start` request matches the `MapPost("/start", ...)` endpoint in `Program.cs`. The json payload in the request should match the workflow input record type that uses the `[FromBody]` attribute in `Program.cs`.
- The `status` request matches the `MapGet("/status", ...)` endpoint in `Program.cs`.
- Use the VS Code REST Client extension or JetBrains HTTP Client to send requests directly from this file.
