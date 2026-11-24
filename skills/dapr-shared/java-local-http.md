# local.http (Java)

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
    "approved": true
}
```

### Key points

- The `<app-port>` must match `server.port` in `application.properties` and `appPort` in `dapr.yaml`.
- The `start` body must match the components of the record that `/start` binds with `@RequestBody` (the
  workflow input record). Spring maps JSON properties to record components by name.
- The `instanceId` is read from the JSON response body of the `start` request.
- The `status`, `pause`, `resume` and `terminate` requests match the controller's `@GetMapping` and
  `@PostMapping` routes.
- Include the `raise-event` request only when the workflow calls `waitForExternalEvent`. Replace
  `<event-name>` with the event name constant the workflow uses, and make the JSON body match the event
  payload record.
- Use the VS Code REST Client extension or the JetBrains HTTP Client to send requests from this file.
