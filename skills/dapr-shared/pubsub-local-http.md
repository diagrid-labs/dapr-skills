## pubsub.http

Resolve every placeholder from the specification interview before writing this file; the vocabulary is in
[pubsub-placeholders.md](pubsub-placeholders.md). The JSON bodies below must carry the fields of
`<EventName>` as the interview defined them, with a plausible value for each — `{{$guid}}` for the
identifier, and values that exercise the handler's validity check on both sides when the domain has one.

```http
@publisherHost=http://localhost:<publisher-port>
@subscriberHost=http://localhost:<subscriber-port>
@daprHost=http://localhost:<publisher-dapr-http-port>

### Publish through the app (the publisher publishes <EventName>)
POST {{publisherHost}}<publish-route>
Content-Type: application/json

{
  "<idField>": "{{$guid}}",
  <eventFieldsJson>
}

### Publish directly through the Dapr sidecar
POST {{daprHost}}/v1.0/publish/pubsub/<TopicName>
Content-Type: application/json

{
  "<idField>": "{{$guid}}",
  <eventFieldsJson>
}

### Subscriptions and components loaded by the sidecar (all subscription types)
GET {{daprHost}}/v1.0/metadata

### Programmatic subscriptions advertised by the app (programmatic only)
GET {{subscriberHost}}/dapr/subscribe

### Call the subscriber endpoint directly with a CloudEvent (declarative and programmatic only)
POST {{subscriberHost}}<SubscribeRoute>
Content-Type: application/cloudevents+json

{
  "specversion": "1.0",
  "id": "{{$guid}}",
  "source": "pubsub-http-test",
  "type": "com.dapr.event.sent",
  "datacontenttype": "application/json",
  "data": { "<idField>": "{{$guid}}", <eventFieldsJson> }
}
```

## Variants

- `<idField>` and `<eventFieldsJson>` are the JSON forms of `<IdProperty>` and the rest of `<EventFields>`. .NET serializes with `JsonSerializerDefaults.Web`, so the keys are camelCase; Python uses the snake_case field names of the Pydantic model and ports 8001, 8002 and 3501.
- Drop the `/dapr/subscribe` request unless the subscription is programmatic.
- Drop the last request for streaming, and drop `@subscriberHost` too.
- Drop requests for a role that is absent.
- Aspire: drop the sidecar publish request and use the `launchSettings.json` port of each project.
- With several events, repeat the first two requests per event and point them at that event's route and topic.

## Key points

- Ports must equal `dapr.yaml` / `launchSettings.json`.
- Use the VS Code REST Client or the JetBrains HTTP Client.
