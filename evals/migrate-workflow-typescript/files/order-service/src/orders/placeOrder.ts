import { randomUUID } from "node:crypto";
import { getCart, deleteCart } from "../cache/cartCache";
import { reserveStock, releaseStock } from "../clients/inventoryClient";
import { chargeCustomer } from "../clients/paymentClient";
import { publishOrderEvent } from "../messaging/publisher";
import { insertOrder } from "../db/reports";
import { recordMetric } from "../jobs/metricsFlush";

export interface PlacedOrder {
  orderId: string;
  chargeId: string;
  totalCents: number;
}

export async function placeOrder(customerId: string): Promise<PlacedOrder> {
  const cart = await getCart(customerId);
  if (!cart || cart.items.length === 0) {
    throw new Error("cart is empty");
  }

  const orderId = randomUUID();
  const totalCents = cart.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const reservation = await reserveStock(orderId, cart.items);
  try {
    const charge = await chargeCustomer(customerId, totalCents, orderId);
    await insertOrder(orderId, customerId, totalCents);
    await deleteCart(customerId);
    publishOrderEvent("order.placed", { orderId, customerId, totalCents });
    recordMetric("orders.placed", 1);
    return { orderId, chargeId: charge.id, totalCents };
  } catch (err) {
    // Compensate: give the stock back if payment or persistence failed.
    await releaseStock(reservation.reservationId);
    publishOrderEvent("order.failed", { orderId, customerId, reason: (err as Error).message });
    throw err;
  }
}
