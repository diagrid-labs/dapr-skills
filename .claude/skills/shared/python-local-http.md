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
@instanceId={{workflowStartRequest.response.body.$.instance_id}}
GET {{host}}/status/{{instanceId}}

### Pause the workflow
POST {{host}}/pause/{{instanceId}}

### Resume the workflow
POST {{host}}/resume/{{instanceId}}

### Terminate the workflow
POST {{host}}/terminate/{{instanceId}}
```

## Key points

- The `<app-port>` must match the port in `dapr.yaml` and `main.py`.
- The `start` request matches the `@app.post("/start")` endpoint in `main.py`. The JSON payload should match the workflow input model.
- The `instance_id` is extracted from the JSON response body of the `start` request.
- The `status` request matches the `@app.get("/status/{instance_id}")` endpoint in `main.py`.
- The `pause`, `resume`, and `terminate` requests match the corresponding `@app.post` endpoints in `main.py`.
- Use the VS Code REST Client extension or JetBrains HTTP Client to send requests directly from this file.
