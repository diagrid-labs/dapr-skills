import axios from "axios";

const stripeApiKey = process.env.STRIPE_SECRET_KEY;

export interface Charge {
  id: string;
  status: string;
}

export async function chargeCustomer(customerId: string, amountCents: number, orderId: string): Promise<Charge> {
  const body = new URLSearchParams({
    amount: String(amountCents),
    currency: "eur",
    customer: customerId,
    description: `Order ${orderId}`,
  });
  const response = await axios.post<Charge>("https://api.stripe.com/v1/charges", body, {
    headers: {
      Authorization: `Bearer ${stripeApiKey}`,
      "Idempotency-Key": orderId,
    },
  });
  return response.data;
}
