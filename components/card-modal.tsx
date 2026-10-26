"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadStripe,
  type ConfirmationToken,
  type Stripe as StripeJs,
  type StripeElements,
  type StripePaymentElement,
} from "@stripe/stripe-js";
import { formatAmount } from "@/lib/format";
import { Button, ErrorBox } from "@/components/ui";

/**
 * A popup around a card-only Payment Element, shaped like the checkout.js
 * modal: open it, the user types a card, it hands back a ConfirmationToken
 * (`ctoken_…`) or null if closed. Card errors stay inside the popup, as in
 * checkout.js. Nothing is charged here.
 *
 * Deferred mode: no PaymentIntent exists yet. The PaymentIntent created later
 * must use the same currency, payment_method_types and capture_method.
 */

export type CardModalOptions = {
  publishableKey: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  captureMethod?: "automatic" | "manual";
  returnUrl: string;
};

export type CardModalResult = { stripe: StripeJs; confirmationToken: ConfirmationToken };

type Pending = { options: CardModalOptions; resolve: (result: CardModalResult | null) => void };

/** `open()` resolves when the popup closes; render `modal` somewhere on the page. */
export function useCardModal() {
  const [pending, setPending] = useState<Pending | null>(null);

  const open = useCallback(
    (options: CardModalOptions) =>
      new Promise<CardModalResult | null>((resolve) => setPending({ options, resolve })),
    [],
  );

  const modal = pending ? (
    <CardModal
      options={pending.options}
      onDone={(result) => {
        pending.resolve(result);
        setPending(null);
      }}
    />
  ) : null;

  return { open, modal };
}

function CardModal({
  options,
  onDone,
}: {
  options: CardModalOptions;
  onDone: (result: CardModalResult | null) => void;
}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountRef = useRef<HTMLDivElement>(null);
  const stripeJsRef = useRef<StripeJs | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);

  useEffect(() => {
    let cancelled = false;
    let element: StripePaymentElement | null = null;

    loadStripe(options.publishableKey)
      .then((stripeJs) => {
        if (cancelled || !stripeJs || !mountRef.current) return;
        const elements = stripeJs.elements({
          mode: "payment",
          amount: options.amount,
          currency: options.currency,
          paymentMethodTypes: ["card"],
          captureMethod: options.captureMethod ?? "automatic",
        });
        element = elements.create("payment");
        element.on("ready", () => setReady(true));
        element.on("loaderror", (e) => setError(e.error.message ?? e.error.type));
        element.mount(mountRef.current);
        stripeJsRef.current = stripeJs;
        elementsRef.current = elements;
      })
      .catch((e: Error) => setError(`Couldn't load Stripe.js: ${e.message}`));

    return () => {
      cancelled = true;
      element?.destroy();
    };
  }, [options]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onDone(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onDone]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const stripeJs = stripeJsRef.current;
    const elements = elementsRef.current;
    if (!stripeJs || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Card details incomplete.");
        return;
      }
      const { error: tokenError, confirmationToken } = await stripeJs.createConfirmationToken({
        elements,
        params: { return_url: options.returnUrl },
      });
      if (tokenError || !confirmationToken) {
        setError(tokenError?.message ?? "No ConfirmationToken returned.");
        return;
      }
      onDone({ stripe: stripeJs, confirmationToken });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !busy && onDone(null)}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{options.name}</div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">{options.description}</div>
          </div>
          <button
            type="button"
            onClick={() => onDone(null)}
            disabled={busy}
            className="text-zinc-400 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error ? <ErrorBox message={error} /> : null}

        <div ref={mountRef} className="min-h-24" />
        {!ready ? <div className="text-xs text-zinc-500 dark:text-zinc-400">Loading Payment Element…</div> : null}

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!ready || busy}>
            {busy ? "Working…" : `Pay ${formatAmount(options.amount, options.currency)}`}
          </Button>
        </div>
      </form>
    </div>
  );
}
