import type Stripe from "stripe";
import { formatAmount } from "./format";

/**
 * A tax rate is either a percentage (e.g. 8.5%) or, less commonly, a flat
 * amount per unit. `rate_type` says which; render accordingly.
 */
export function formatRate(rate: Stripe.TaxRate): string {
  if (rate.rate_type === "flat_amount" && rate.flat_amount) {
    return formatAmount(rate.flat_amount.amount, rate.flat_amount.currency);
  }
  return `${rate.percentage}%`;
}

/** Inclusive = tax is baked into the price; exclusive = added on top. */
export function inclusivity(rate: Stripe.TaxRate): string {
  return rate.inclusive ? "Inclusive" : "Exclusive";
}

/** A human region label from whatever geography fields are populated. */
export function region(rate: Stripe.TaxRate): string {
  return (
    [rate.country, rate.state].filter(Boolean).join(" ") ||
    rate.jurisdiction ||
    "—"
  );
}
