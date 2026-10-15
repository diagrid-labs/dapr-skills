# Pub/sub placeholder vocabulary

Every pub/sub template file (`dotnet-pubsub-*.md`, `python-pubsub-*.md`, `dapr-pubsub-subscription.md`,
`pubsub-dapr-yaml.md`, `pubsub-local-http.md`) is written against this vocabulary. The create and add
skills resolve each placeholder from the specification interview before copying a template, so the
generated application is about the user's domain and never about a built-in sample scenario.

**There is no default domain.** When the prompt does not say what the application publishes, ask.
Never fall back to an order-processing example.

## Project placeholders

These already existed and are unchanged.

| Placeholder | Meaning | Example |
|---|---|---|
| `<ProjectRoot>` | root folder and solution name | `ShipTrack` |
| `<ProjectName>` | a project folder inside the root | `ShipTrack.Publisher` |
| `<ProjectNamespace>` | the namespace of the project a file lives in | `ShipTrack.Publisher` |
| `<root-kebab>` | `<ProjectRoot>` lowercased and hyphenated, used for app ids | `shiptrack` |

## Domain placeholders

Resolved from the **Check specification** interview. The examples below show one resolved shipment
scenario; they are illustrations, not defaults.

| Placeholder | Meaning | Example |
|---|---|---|
| `<EventName>` | PascalCase message type | `ShipmentDispatched` |
| `<eventVar>` | camelCase instance name for that type | `shipment` |
| `<EventFields>` | the contract members, from the interview | `string ShipmentId, string Carrier, DateTimeOffset DispatchedAt` |
| `<IdProperty>` | the field that uniquely identifies a message; the handler deduplicates on it | `ShipmentId` |
| `<EventDescription>` | lowercase noun phrase used in log and error text | `shipment` |
| `<TopicName>` | the topic string | `shipments` |
| `<TopicResource>` | PascalCase of `<TopicName>`, used for a subscriber controller or handler name | `Shipments` |
| `<TopicConstant>` | the `PubSubNames` constant holding `<TopicName>` | `ShipmentsTopic` |
| `<DeadLetterTopicName>` | the dead-letter topic string, `<TopicName>-deadletter` | `shipments-deadletter` |
| `<DeadLetterTopicConstant>` | the constant holding it | `ShipmentsDeadLetterTopic` |
| `<PublishRoute>` | the publisher's route segment | `shipments` |
| `<PublishResource>` | PascalCase of `<PublishRoute>`, used for a controller name | `Shipments` |
| `<SubscribeRoute>` | the subscriber's route path, `/events/pubsub/<TopicName>` | `/events/pubsub/shipments` |
| `<DeadLetterRoute>` | `/events/pubsub/<DeadLetterTopicName>` | `/events/pubsub/shipments-deadletter` |
| `<ValidationCondition>` | the handler's domain validity check, from the interview | `string.IsNullOrWhiteSpace(shipment.ShipmentId)` |
| `<HandlerBody>` | what the subscriber does with the event, from the interview | `logger.LogInformation("Shipment {ShipmentId} dispatched via {Carrier}", shipment.ShipmentId, shipment.Carrier);` |

Two more are used only when the user asks for content-based routing:

| Placeholder | Meaning | Example |
|---|---|---|
| `<RuleName>` | short lowercase name of the case a routing rule selects | `express` |
| `<MatchExpression>` | the CEL expression over `event.data` | `event.data.carrier == "air"` |

### Python forms

Python uses the same concepts with Python casing.

| Placeholder | Meaning | Example |
|---|---|---|
| `<event_name>` | snake_case instance and module name | `shipment` |
| `<id_field>` | snake_case form of `<IdProperty>` | `shipment_id` |
| `<event_fields>` | the Pydantic model fields | `shipment_id: str`, `carrier: str` |
| `<TOPIC_CONST>` | module-level constant holding `<TopicName>` | `SHIPMENTS_TOPIC` |
| `<DEAD_LETTER_TOPIC_CONST>` | module-level constant for the dead-letter topic | `SHIPMENTS_DEAD_LETTER_TOPIC` |
| `<validation_condition>` | the handler's domain validity check | `not shipment.shipment_id` |
| `<handler_body>` | what the subscriber does with the event | `logger.info("Shipment %s dispatched via %s", shipment.shipment_id, shipment.carrier)` |
| `<publish_route>` | the publisher's route segment | `shipments` |
| `<subscribe_route>` | the subscriber's route path | `/events/pubsub/shipments` |
| `<dead_letter_route>` | the dead-letter route path | `/events/pubsub/shipments-deadletter` |

### Request-file and add-skill forms

| Placeholder | Meaning | Example |
|---|---|---|
| `<publish-route>` | kebab form of `<PublishRoute>`, used in `dapr.yaml` and `pubsub.http` | `shipments` |
| `<idField>` | `<IdProperty>` as a JSON key: camelCase for .NET, snake_case for Python | `shipmentId` / `shipment_id` |
| `<eventFieldsJson>` | the rest of `<EventFields>` as JSON key/value pairs | `"carrier": "DHL", "dispatchedAt": "2026-10-15T10:00:00Z"` |
| `<existing_endpoint>` | the endpoint an add skill edits to also publish | `create_shipment` |

`<HandlerBody>` / `<handler_body>` is whatever the user said the subscriber should do. When they described
no action beyond receiving the event, log it at information level with its identifying fields and nothing
else — never invent a side effect the user did not ask for.

## Names that are not placeholders

Keep these exactly as written; they are infrastructure, not domain.

- The component name `pubsub`. The code only ever refers to the component by this name, which is what
  makes the README's "switching the message broker" paragraph true. An add skill reusing an existing
  component with another name puts that name in `PubSubName` and changes nothing else.
- `PubSubNames` (.NET), the class holding the component and topic constants.
- `IProcessedEvents` / `InMemoryProcessedEvents` (.NET) and `ProcessedEvents` (Python), the idempotency
  store. It is keyed by `<IdProperty>` but is not itself domain-specific.
- `PublishFeatures` (.NET), the TTL and raw-payload options record.

## More than one event

The templates show one event. When the interview produced several, repeat the per-event parts once per
event and leave the shared parts alone:

**Repeat:** the contract record or model, its `<TopicConstant>` and `<DeadLetterTopicConstant>` pair, the
publisher method, the publish endpoint, the handler class, the `Subscription` YAML block and its
dead-letter block, and the route entries.

**Do not repeat:** the `pubsub` component, the resiliency policy, `PubSubNames` itself, the idempotency
store, `PublishFeatures`, and the service registrations for those.
