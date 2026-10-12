import amqp from "amqplib";

const EXCHANGE = "orders";

let channel: amqp.Channel | undefined;

export async function connectPublisher(): Promise<void> {
  const connection = await amqp.connect(process.env.AMQP_URL ?? "amqp://localhost:5672");
  channel = await connection.createChannel();
  await channel.assertExchange(EXCHANGE, "topic", { durable: true });
}

export function publishOrderEvent(routingKey: string, payload: Record<string, unknown>): void {
  if (!channel) {
    throw new Error("publisher not connected");
  }
  channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
    contentType: "application/json",
    persistent: true,
  });
}
