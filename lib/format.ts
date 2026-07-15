/**
 * Stripe stores amounts in a currency's *minor* unit (2000 = $20.00), so every
 * amount crossing the UI boundary needs converting. Zero-decimal currencies
 * (JPY and friends) are the exception: there, 2000 means ¥2000.
 * https://docs.stripe.com/currencies#zero-decimal
 */
const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

export function minorPerUnit(currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? 1 : 100;
}

/** 2000, "usd" -> "$20.00" */
export function formatAmount(
  amount: number | null,
  currency: string | null,
): string {
  if (amount === null || currency === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / minorPerUnit(currency));
  } catch {
    return `${amount} ${currency.toUpperCase()}`;
  }
}

/** "20.00", "usd" -> 2000 */
export function toMinorUnits(input: string, currency: string): number {
  return Math.round(Number(input) * minorPerUnit(currency));
}

/** 2000, "usd" -> "20.00" — for populating an edit field. */
export function toMajorUnits(amount: number, currency: string): string {
  const per = minorPerUnit(currency);
  return per === 1 ? String(amount) : (amount / per).toFixed(2);
}

/**
 * The renewal date lives on the subscription *item*, not the subscription —
 * `subscription.current_period_end` was removed in recent API versions and
 * reading it yields undefined. Always go through here.
 */
export function periodEnd(sub: {
  items: { data: Array<{ current_period_end: number }> };
}): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? null;
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
