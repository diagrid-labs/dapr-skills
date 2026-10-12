import "dotenv/config";
import express from "express";
import { ordersRouter } from "./routes/orders";
import { startAbandonedCartJob } from "./jobs/abandonedCarts";
import { startMetricsFlusher } from "./jobs/metricsFlush";
import { connectPublisher } from "./messaging/publisher";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.send({ status: "ok" });
});

app.use("/orders", ordersRouter);

const port = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  await connectPublisher();
  startAbandonedCartJob();
  startMetricsFlusher();
  app.listen(port, () => {
    console.log(`order-service listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error("order-service failed to start", err);
  process.exit(1);
});
