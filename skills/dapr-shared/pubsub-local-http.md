## pubsub.http

```http
@publisherHost=http://localhost:<publisher-port>
@subscriberHost=http://localhost:<subscriber-port>
@daprHost=http://localhost:<publisher-dapr-http-port>

### Place an order (the publisher publishes OrderPlaced)
POST {{publisherHost}}<publish-route>
Content-Type: application/json

{
  "orderId": "{{$guid}}",
  "customerId": "customer-1",
  "amount": 1500,
  "placedAt": "2026-10-13T10:00:00Z"
}

### Publish directly through the Dapr sidecar
POST {{daprHost}}/v1.0/publish/pubsub/orders
Content-Type: application/json

{
  "orderId": "{{$guid}}",
  "customerId": "customer-2",
  "amount": 10,
  "placedAt": "2026-10-13T10:00:00Z"
}

### Subscriptions and components loaded by the sidecar (all subscription types)
GET {{daprHost}}/v1.0/metadata

### Programmatic subscriptions advertised by the app (programmatic only)
GET {{subscriberHost}}/dapr/subscribe

### Call the subscriber endpoint directly with a CloudEvent (declarative and programmatic only)
POST {{subscriberHost}}/events/pubsub/orders
Content-Type: application/cloudevents+json

{
  "specversion": "1.0",
  "id": "{{$guid}}",
  "source": "pubsub-http-test",
  "type": "com.dapr.event.sent",
  "datacontenttype": "application/json",
  "data": { "orderId": "{{$guid}}", "customerId": "customer-3", "amount": 42, "placedAt": "2026-10-13T10:00:00Z" }
}
```

## Variants

- Python uses snake_case JSON keys (`order_id`, `customer_id`, `placed_at`) and ports 8001, 8002 and 3501.
- Drop the `/dapr/subscribe` request unless the subscription is programmatic.
- Drop the last request for streaming, and drop `@subscriberHost` too.
- Drop requests for a role that is absent.
- Aspire: drop the sidecar publish request and use the `launchSettings.json` port of each project.

## Key points

- Ports must equal `dapr.yaml` / `launchSettings.json`.
- Use the VS Code REST Client or the JetBrains HTTP Client.
