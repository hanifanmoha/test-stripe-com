/**
 * Server-only Stripe access. This project no longer uses the Stripe SDK at
 * runtime — the backend is a transparent proxy that forwards raw HTTP to
 * Stripe's REST API (see app/api/[...path]/route.ts). All this module does is
 * hold the secret key and the API base, so the key never reaches the browser.
 *
 * Importing this from a Client Component would bundle STRIPE_SECRET_KEY into
 * browser JS — don't. Only the catch-all route imports it.
 *
 * (The `stripe` npm package is still installed, but for its TypeScript types
 * only — `import type Stripe from "stripe"` in the pages. No runtime import.)
 */
export const STRIPE_API_BASE = "https://api.stripe.com";

export function stripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Copy .env.local.example to .env.local and add your Stripe test key.",
    );
  }
  return key;
}
