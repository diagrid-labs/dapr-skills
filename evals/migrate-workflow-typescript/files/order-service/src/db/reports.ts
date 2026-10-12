import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface RevenueRow {
  day: string;
  orders: number;
  revenueCents: number;
}

export async function getDailyRevenue(days: number): Promise<RevenueRow[]> {
  const result = await pool.query<RevenueRow>(
    `SELECT date_trunc('day', created_at)::date AS day,
            count(*)::int AS orders,
            sum(total_cents)::int AS "revenueCents"
       FROM orders
      WHERE created_at > now() - make_interval(days => $1)
      GROUP BY 1
      ORDER BY 1 DESC`,
    [days],
  );
  return result.rows;
}

export async function insertOrder(orderId: string, customerId: string, totalCents: number): Promise<void> {
  await pool.query("INSERT INTO orders (id, customer_id, total_cents, created_at) VALUES ($1, $2, $3, now())", [
    orderId,
    customerId,
    totalCents,
  ]);
}
