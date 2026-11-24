# notifications-service

Sends customer e-mails for events it receives from the Dapr pub/sub.

- Subscribes to the `emails` topic on the `pubsub` component (`@Topic` on `EmailEventsController`).
- Run it with `dapr run -f .`; it listens on port 8086.
