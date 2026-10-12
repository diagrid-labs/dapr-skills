import Redis from "ioredis";

export interface CartItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface Cart {
  customerId: string;
  items: CartItem[];
  updatedAt: number;
}

const CART_TTL_SECONDS = 60 * 60 * 24;

const redis = new Redis({
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
});

export async function saveCart(cart: Cart): Promise<void> {
  await redis.set(`cart:${cart.customerId}`, JSON.stringify(cart), "EX", CART_TTL_SECONDS);
}

export async function getCart(customerId: string): Promise<Cart | null> {
  const raw = await redis.get(`cart:${customerId}`);
  return raw ? (JSON.parse(raw) as Cart) : null;
}

export async function deleteCart(customerId: string): Promise<void> {
  await redis.del(`cart:${customerId}`);
}

export async function listCartKeys(): Promise<string[]> {
  return redis.keys("cart:*");
}
