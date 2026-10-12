import { Router } from "express";
import { getCart, saveCart, Cart } from "../cache/cartCache";
import { placeOrder } from "../orders/placeOrder";
import { getDailyRevenue } from "../db/reports";

export const ordersRouter = Router();

ordersRouter.get("/carts/:customerId", async (req, res) => {
  const cart = await getCart(req.params.customerId);
  if (!cart) {
    res.status(404).send({ error: "cart not found" });
    return;
  }
  res.send(cart);
});

ordersRouter.put("/carts/:customerId", async (req, res) => {
  const cart: Cart = { customerId: req.params.customerId, items: req.body.items ?? [], updatedAt: Date.now() };
  await saveCart(cart);
  res.status(204).send();
});

ordersRouter.post("/checkout/:customerId", async (req, res) => {
  try {
    const order = await placeOrder(req.params.customerId);
    res.status(201).send(order);
  } catch (err) {
    res.status(409).send({ error: (err as Error).message });
  }
});

ordersRouter.get("/reports/revenue", async (req, res) => {
  const days = Number(req.query.days ?? 7);
  res.send(await getDailyRevenue(days));
});
