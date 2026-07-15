import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { proxy } from "@/lib/api";

/**
 * Retrieves a completed Checkout Session so the success page can show what
 * actually happened, rather than trusting the redirect.
 *
 * This is the redirect-time counterpart to a webhook: Stripe substitutes the
 * real id into the `{CHECKOUT_SESSION_ID}` placeholder in `success_url`, the
 * browser hands it back here, and we ask Stripe what the outcome was.
 *
 * Landing on `success_url` proves nothing — anyone can type that URL. This
 * server-side retrieve *is* the verification: `payment_status` is the
 * authoritative answer, and Stripe's own docs point at it for deciding when to
 * fulfill an order.
 *
 * Note this doesn't remove the need for a webhook. It only fires if the user
 * comes back, and no redirect ever happens for later events (a portal cancel, a
 * failed renewal). It's the fast path, not the reliable one.
 *
 *   curl -G https://api.stripe.com/v1/checkout/sessions/cs_test_123 \
 *     -u "$STRIPE_SECRET_KEY:" \
 *     --data-urlencode "expand[]=subscription" \
 *     --data-urlencode "expand[]=customer"
 *
 * SECURITY: takes a session id straight from the client, same caveat as
 * /api/checkout and /api/portal. Fine with no auth here; in production, check
 * the session's customer against the logged-in user before returning payment
 * details, or one user could read another's by pasting their session id.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/checkout/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;

    // The subscription is what the customer actually bought; expanding it here
    // saves the client a second round trip to /api/subscriptions.
    return stripe().checkout.sessions.retrieve(id, {
      expand: ["subscription", "customer"],
    });
  });
}
