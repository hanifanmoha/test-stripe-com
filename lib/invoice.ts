import type Stripe from "stripe";

const BILLING_REASON_LABEL: Record<string, string> = {
  subscription_create: "Initial",
  subscription_cycle: "Renewal",
  subscription_update: "Change",
  subscription_threshold: "Usage threshold",
  manual: "Manual",
};

/** Plain-words version of Stripe's billing_reason enum. */
export function billingReasonLabel(reason: string | null): string {
  if (!reason) return "—";
  return BILLING_REASON_LABEL[reason] ?? reason;
}

/**
 * The subscription id moved off the top-level `invoice.subscription` field in
 * recent API versions — it now lives on `parent.subscription_details`. Reading
 * the old path silently yields nothing (verified: absent on live invoices).
 * Returns null for invoices that didn't come from a subscription.
 */
export function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const sub = inv.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

/** Invoices snapshot the customer's name/email, so no expand is needed. */
export function invoiceCustomerLabel(inv: Stripe.Invoice): string {
  if (inv.customer_name) return inv.customer_name;
  if (inv.customer_email) return inv.customer_email;
  if (typeof inv.customer === "string") return inv.customer;
  return inv.customer?.id ?? "—";
}
