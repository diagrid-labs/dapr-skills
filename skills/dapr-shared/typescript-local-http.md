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
    "customerName": "Ada Lovelace",
    "items": [
        { "productId": "sku-1", "quantity": 2, "unitPrice": 19.99 },
        { "productId": "sku-2", "quantity": 1, "unitPrice": 49.5 }
    ]
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

### Purge the workflow history (only after it reaches a terminal state)
POST {{host}}/purge/{{instanceId}}
```

## Key points

- The `<app-port>` must match the `appPort` in `dapr.yaml` and the port `DaprServer` listens on in `src/index.ts`.
- The `start` request matches the `app.post("/start", ...)` route in `src/index.ts`. The JSON payload must match the `OrderInput` model.
- The `instance_id` is extracted from the JSON response body of the `start` request.
- The `status` request matches the `app.get("/status/:instanceId", ...)` route.
- The `pause`, `resume`, `terminate`, and `purge` requests match the corresponding `app.post` routes.
- Use the VS Code REST Client extension or JetBrains HTTP Client to send requests directly from this file.
