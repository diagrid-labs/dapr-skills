import axios from "axios";
import { CartItem } from "../cache/cartCache";

const inventoryBaseUrl = process.env.INVENTORY_SERVICE_URL ?? "http://localhost:4001";

export interface Reservation {
  reservationId: string;
  expiresAt: string;
}

export async function reserveStock(orderId: string, items: CartItem[]): Promise<Reservation> {
  const response = await axios.post<Reservation>(`${inventoryBaseUrl}/reservations`, {
    orderId,
    items: items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
  });
  return response.data;
}

export async function releaseStock(reservationId: string): Promise<void> {
  await axios.delete(`${inventoryBaseUrl}/reservations/${reservationId}`);
}
