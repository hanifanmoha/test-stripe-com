import Stripe from "stripe";

/**
 * Server-only Stripe client. Never import this from a Client Component —
 * doing so would bundle STRIPE_SECRET_KEY into the browser payload.
 *
 * Lazily constructed so that `next build` succeeds without a key present;
 * the error surfaces on first request instead of at module load.
 */
let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Copy .env.local.example to .env.local and add your Stripe test key.",
    );
  }

  client = new Stripe(key);
  return client;
}
