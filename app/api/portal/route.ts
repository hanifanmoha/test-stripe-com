import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { body, proxy } from "@/lib/api";

/**
 * Creates a Customer Portal session — Stripe-hosted billing management where a
 * customer can see their subscriptions and invoices, update payment methods,
 * and cancel. Same shape as /api/checkout: create server-side, hand back a URL,
 * redirect. No client-side Stripe SDK involved.
 *
 * The session is scoped to a *customer*, not a subscription: it exposes
 * everything that customer has. Pass `subscription` to deep-link straight into
 * the cancel flow for one of them.
 *
 * SECURITY: this takes a customer id straight from the request body, which is
 * fine for a local playground with no login but would be an IDOR in production
 * — anyone could pass someone else's `cus_...` and get control of their
 * billing. In a real app, derive the customer from the authenticated session
 * and never trust the client for it.
 */
export async function POST(request: NextRequest) {
  return proxy(async () => {
    const input = await body<{ customer: string; subscription?: string }>(
      request,
    );
    if (!input.customer) throw new Error("A customer is required.");

    const origin = request.nextUrl.origin;

    const session = await stripe().billingPortal.sessions.create({
      customer: input.customer,
      return_url: `${origin}/customers/${input.customer}`,
      // Deep-link into a single subscription's cancel screen when asked;
      // otherwise land on the portal home showing everything.
      ...(input.subscription
        ? {
            flow_data: {
              type: "subscription_cancel" as const,
              subscription_cancel: { subscription: input.subscription },
            },
          }
        : {}),
    });

    return { url: session.url };
  });
}
