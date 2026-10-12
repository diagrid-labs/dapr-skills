import cron from "node-cron";
import { getCart, listCartKeys, deleteCart } from "../cache/cartCache";
import { publishOrderEvent } from "../messaging/publisher";

const ABANDONED_AFTER_MS = 6 * 60 * 60 * 1000;

export function startAbandonedCartJob(): void {
  // Every hour on the hour: notify marketing about carts idle for 6+ hours, then drop them.
  cron.schedule("0 * * * *", async () => {
    const keys = await listCartKeys();
    for (const key of keys) {
      const customerId = key.replace("cart:", "");
      const cart = await getCart(customerId);
      if (cart && Date.now() - cart.updatedAt > ABANDONED_AFTER_MS) {
        publishOrderEvent("cart.abandoned", { customerId, itemCount: cart.items.length });
        await deleteCart(customerId);
      }
    }
  });
}
