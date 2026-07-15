import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { body, proxy } from "@/lib/api";

/**
 * Creates a Stripe-hosted Checkout Session and hands back its URL. The browser
 * then navigates to Stripe's own domain to enter card details, so raw card data
 * never touches this server — that's what keeps us out of PCI scope, and why no
 * client-side Stripe SDK is needed for this flow.
 *
 * This is where a subscription actually originates: Stripe creates it once the
 * session is paid. The raw HTTP equivalent of the SDK call below:
 *
 *   curl https://api.stripe.com/v1/checkout/sessions \
 *     -u "$STRIPE_SECRET_KEY:" \
 *     -d mode=subscription \
 *     -d customer=cus_123 \
 *     -d "line_items[0][price]=price_123" \
 *     -d "line_items[0][quantity]=1" \
 *     --data-urlencode "success_url=http://localhost:3000/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}" \
 *     --data-urlencode "cancel_url=http://localhost:3000/subscriptions?checkout=cancelled"
 *
 * Notes on translating the SDK to curl:
 *   no -G      unlike the list endpoints, this is a real POST — the -d values
 *              belong in the body.
 *   line_items nested arrays of objects use doubled brackets: an index, then
 *              the field. `line_items[0][price]`, not `line_items[price]`.
 *   --data-urlencode on the URLs is mandatory, not stylistic. With a plain -d,
 *              curl reads the `&` before `session_id` as a field separator, so
 *              `session_id={CHECKOUT_SESSION_ID}` is sent as its own form
 *              parameter and Stripe rejects the whole call with
 *              "Received unknown parameter: session_id".
 *   {CHECKOUT_SESSION_ID} must reach Stripe literally, braces and all — it's a
 *              placeholder Stripe substitutes on redirect, not something we
 *              interpolate. --data-urlencode escapes it on the wire and Stripe
 *              stores it decoded; the round-trip is verified.
 *
 * The response's `url` is the checkout.stripe.com page to redirect to, and
 * `status` starts as "open".
 */
export async function POST(request: NextRequest) {
  return proxy(async () => {
    const input = await body<{ customer: string; price: string }>(request);
    if (!input.customer) throw new Error("A customer is required.");
    if (!input.price) throw new Error("A price is required.");

    // Where Stripe sends the browser back to. Derived from the incoming request
    // so this works on localhost and any deployment without extra config.
    const origin = request.nextUrl.origin;

    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: input.customer,
      line_items: [{ price: input.price, quantity: 1 }],
      // {CHECKOUT_SESSION_ID} is a literal placeholder Stripe substitutes on
      // redirect — it must not be URL-encoded or interpolated by us.
      success_url: `${origin}/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscriptions?checkout=cancelled`,
    });

    return { url: session.url, id: session.id };
  });
}
