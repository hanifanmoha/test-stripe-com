/**
 * A Charge as this app reads it. Hand-written instead of `Stripe.Charge`
 * because the installed types describe the newest API version, which no
 * longer documents `charge.source` — and `source` is exactly what 99-stripe
 * reads its card info from today.
 */
export type ChargeCard = {
  brand?: string;
  last4?: string;
  exp_month?: number;
  exp_year?: number;
  name?: string | null;
};

export type Charge = {
  id: string;
  object: "charge";
  amount: number;
  amount_refunded: number;
  currency: string;
  status: "succeeded" | "pending" | "failed";
  paid: boolean;
  refunded: boolean;
  description: string | null;
  receipt_number: string | null;
  receipt_url: string | null;
  failure_code: string | null;
  failure_message: string | null;
  statement_descriptor: string | null;
  statement_descriptor_suffix: string | null;
  calculated_statement_descriptor: string | null;
  created: number;
  metadata: Record<string, string>;
  customer: string | { id: string; name?: string | null; email?: string | null } | null;
  payment_intent: string | null;
  source?: (ChargeCard & { id?: string; object?: string }) | null;
  payment_method_details?: { type?: string; card?: ChargeCard } | null;
  outcome?: { seller_message?: string; network_status?: string } | null;
};

/** 99-stripe reads `charge.source`; the newer home is `payment_method_details.card`. */
export function chargeCard(charge: Charge): ChargeCard | null {
  return charge.source ?? charge.payment_method_details?.card ?? null;
}

export function cardLabel(card: ChargeCard | null | undefined): string {
  if (!card?.last4) return "—";
  const expiry = card.exp_month && card.exp_year
    ? ` ${String(card.exp_month).padStart(2, "0")}/${String(card.exp_year).slice(-2)}`
    : "";
  return `${card.brand ?? "card"} •••• ${card.last4}${expiry}`;
}

export function chargeCustomerLabel(charge: Charge): string {
  const c = charge.customer;
  if (!c) return "—";
  if (typeof c === "string") return c;
  return c.name || c.email || c.id;
}

export function chargeCustomerId(charge: Charge): string | null {
  const c = charge.customer;
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}
