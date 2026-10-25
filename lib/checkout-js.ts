/**
 * Legacy Stripe Checkout (`checkout.js`) — the pre-2019 card modal that 99-spa
 * and 99-spa-v2 still use through `react-stripe-checkout`. That library does
 * exactly this: load the script, `StripeCheckout.configure({ key, token })`,
 * then `.open(config)`. The modal posts the card to Stripe with the
 * *publishable* key and hands back a single-use token (`tok_…`).
 *
 * New accounts block this by default: enable "Enable card data collection with
 * a publishable key without using Stripe's pre-built UI elements" at
 * dashboard.stripe.com/settings/integration, or tokenization fails with
 * "This integration surface is unsupported for publishable key tokenization".
 *
 * The script sends no Stripe-Version, so the token call runs on the account
 * default — our proxy's pinned version does not apply here.
 */

export const CHECKOUT_JS_URL = "https://checkout.stripe.com/checkout.js";

export type LegacyToken = {
  id: string;
  email: string;
  created: number;
  livemode: boolean;
  card: {
    id: string;
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
    name: string | null;
    country: string | null;
    funding: string;
  };
};

/** The `open()` options 99-spa / 99-spa-v2 pass via `react-stripe-checkout`. */
export type LegacyCheckoutOptions = {
  name: string;
  description: string;
  currency: string;
  email: string;
  amount: number;
  allowRememberMe: boolean;
};

type Handler = { open: (options: LegacyCheckoutOptions) => void; close: () => void };

declare global {
  interface Window {
    StripeCheckout?: {
      configure: (config: {
        key: string;
        token: (token: LegacyToken) => void;
        closed?: () => void;
      }) => Handler;
    };
  }
}

let loading: Promise<void> | null = null;

function loadCheckoutJs(): Promise<void> {
  if (window.StripeCheckout) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_JS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error(`Couldn't load ${CHECKOUT_JS_URL}`));
    };
    document.body.appendChild(script);
  });
  return loading;
}

/** Opens the modal; resolves with the token, or null if the user closes it. */
export async function openLegacyCheckout(
  publishableKey: string,
  options: LegacyCheckoutOptions,
): Promise<LegacyToken | null> {
  await loadCheckoutJs();
  return new Promise((resolve) => {
    const handler = window.StripeCheckout!.configure({
      key: publishableKey,
      token: resolve,
      // Fires after `token` too; the promise already settled by then.
      closed: () => resolve(null),
    });
    handler.open(options);
  });
}
