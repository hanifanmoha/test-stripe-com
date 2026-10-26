"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type RawResponse } from "@/lib/client";
import { cardLabel, type Charge } from "@/lib/charge";
import { formatAmount } from "@/lib/format";
import { Button, ErrorBox, Mono, Notice } from "@/components/ui";
import { useCardModal } from "@/components/card-modal";
import {
  DEFAULT_PURCHASE,
  MIN_AMOUNT,
  MissingKeyNotice,
  PUBLISHABLE_KEY,
  PurchaseFields,
  Steps,
  amounts,
  chargeMetadata,
  newCustomerParams,
  stripeError,
  useCustomers,
  type FlowProps,
  type Purchase,
  type Step,
} from "./shared";

export const CONFIRMATION_TOKEN_FLOW = "confirmation-token";

const CREATE_PI = "99-web-listings → 99-stripe → Stripe POST /v1/payment_intents (confirm=true)";

type PaymentIntent = Omit<Stripe.PaymentIntent, "latest_charge"> & {
  latest_charge: Charge | string | null;
};

function paymentIntentSummary(pi: PaymentIntent): { label: string; value: string }[] {
  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  return [
    { label: "PaymentIntent", value: pi.id },
    { label: "Status", value: pi.status },
    { label: "Amount", value: formatAmount(pi.amount, pi.currency) },
    { label: "Charge", value: charge?.id ?? (typeof pi.latest_charge === "string" ? pi.latest_charge : "— none yet") },
    { label: "Card", value: cardLabel(charge?.payment_method_details?.card) },
    { label: "On card statement", value: charge?.calculated_statement_descriptor ?? "—" },
    ...(pi.last_payment_error
      ? [{ label: "Last error", value: `${pi.last_payment_error.code ?? pi.last_payment_error.type}: ${pi.last_payment_error.message ?? ""}` }]
      : []),
  ];
}

function chargeIdOf(pi: PaymentIntent): string | null {
  if (!pi.latest_charge) return null;
  return typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge.id;
}

/**
 * The card is collected by Stripe's Payment Element and handed to the backend
 * as a ConfirmationToken; the backend still triggers the payment:
 *
 *   1. browser   Payment Element popup → stripe.createConfirmationToken → ctoken_…
 *   2. backend   (optional) read the ConfirmationToken to check the card first
 *   3. backend   find or create the customer — no card is saved on it
 *   4. backend   POST /v1/payment_intents confirm=true confirmation_token=ctoken_…
 *                → succeeded: done, same request, like POST /v1/charges today
 *                → requires_action: 3D Secure is needed, hand back to the browser
 *   5. browser   stripe.handleNextAction → the customer authenticates
 *   6. backend   GET /v1/payment_intents/{id} → fulfil only if succeeded
 *
 * Steps 2-4 and 6 are server-side in a real build; here the page sends the
 * same Stripe requests through the proxy so each one is visible.
 */
export function ConfirmationTokenFlow({ searchParams }: FlowProps) {
  const { customers, setCustomers, error: loadError } = useCustomers();
  const [purchase, setPurchase] = useState<Purchase>(DEFAULT_PURCHASE);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cardModal = useCardModal();

  const selected = customers?.find((c) => c.id === purchase.customer) ?? null;
  const { gstMinor, totalMinor, descriptorSuffix } = amounts(purchase);
  const returnedPaymentIntent = searchParams.payment_intent;

  const push = (step: Step) => setSteps((s) => [...s, step]);

  // A redirect-based next action comes back here with ?payment_intent=pi_…
  useEffect(() => {
    if (!returnedPaymentIntent) return;
    stripe
      .raw("GET", `/v1/payment_intents/${returnedPaymentIntent}`, { expand: ["latest_charge"] })
      .then((res) => {
        const pi = res.body as PaymentIntent;
        setSteps([
          {
            title: "Returned from the redirect — check the PaymentIntent",
            prod: "99-web-listings confirm → 99-stripe → Stripe GET /v1/payment_intents/{id}",
            request: { method: "GET", path: `/v1/payment_intents/${returnedPaymentIntent}`, params: { expand: ["latest_charge"] } },
            response: res,
            ...(res.ok ? { summary: paymentIntentSummary(pi) } : { error: stripeError(res) }),
          },
        ]);
        if (res.ok && pi.status === "succeeded") setChargeId(chargeIdOf(pi));
      });
  }, [returnedPaymentIntent]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setSteps([]);
    setChargeId(null);
    setError(null);

    if (totalMinor < MIN_AMOUNT) {
      setError(`99-stripe rejects charges under ${formatAmount(MIN_AMOUNT, "sgd")} (invalid_amount).`);
      return;
    }
    setRunning(true);
    const sourceRefId = purchase.sourceRefId || `txn_${Date.now()}`;

    try {
      // 1. The popup collects the card and returns a ConfirmationToken, like
      //    checkout.js returns a token. Stripe.js is @stripe/stripe-js v6
      //    (Acacia). return_url travels inside the token; Stripe only uses it
      //    if a next action has to leave the page.
      const returnUrl = `${window.location.origin}/charges/new?flow=${CONFIRMATION_TOKEN_FLOW}`;
      const tokenStep = {
        title: "1. Create the ConfirmationToken",
        prod: "Browser: Payment Element popup → stripe.createConfirmationToken (publishable key)",
        request: { method: "Stripe.js", path: "createConfirmationToken()", params: { return_url: returnUrl } },
      };
      const popup = await cardModal.open({
        publishableKey: PUBLISHABLE_KEY,
        name: "99.co",
        description: `Payment for ${purchase.title || "package"}`,
        amount: totalMinor,
        currency: "sgd",
        returnUrl,
      });
      if (!popup) {
        push({ ...tokenStep, error: "Popup closed without a card. Nothing was sent to the backend." });
        return;
      }
      const { stripe: stripeJs, confirmationToken } = popup;
      const preview = confirmationToken.payment_method_preview;
      push({
        ...tokenStep,
        response: { status: 200, ok: true, body: confirmationToken },
        summary: [
          { label: "ConfirmationToken", value: confirmationToken.id },
          { label: "Card", value: cardLabel(preview?.card) },
          { label: "Expires", value: confirmationToken.expires_at ? new Date(confirmationToken.expires_at * 1000).toLocaleString() : "—" },
        ],
      });

      // 2. Optional server-side check before money moves: the secret key can
      //    read the token and see the card it carries.
      const inspectRes = await stripe.raw("GET", `/v1/confirmation_tokens/${confirmationToken.id}`);
      const inspected = inspectRes.body as {
        payment_method_preview?: {
          card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number; funding?: string; three_d_secure_usage?: { supported?: boolean } };
        };
      };
      push({
        title: "2. Read the ConfirmationToken (optional)",
        prod: "99-stripe, before charging — e.g. to log or reject the card",
        request: { method: "GET", path: `/v1/confirmation_tokens/${confirmationToken.id}`, params: {} },
        response: inspectRes,
        ...(inspectRes.ok
          ? {
              summary: [
                { label: "Card", value: cardLabel(inspected.payment_method_preview?.card) },
                { label: "Funding", value: inspected.payment_method_preview?.card?.funding ?? "—" },
                { label: "Supports 3D Secure", value: String(inspected.payment_method_preview?.card?.three_d_secure_usage?.supported ?? "—") },
              ],
            }
          : { error: stripeError(inspectRes) }),
      });

      // 3. The customer only labels the payment now — no card is saved on it.
      let customerId: string;
      if (selected) {
        customerId = selected.id;
        push({
          title: "3. Use the agent's existing customer",
          prod: "99-stripe looks up the customer by agent; no card replace step",
          summary: [
            { label: "Customer", value: selected.id },
            { label: "Email", value: selected.email ?? "—" },
          ],
        });
      } else {
        const params = newCustomerParams(purchase);
        const res = await stripe.raw("POST", "/v1/customers", params);
        const customer = res.body as Stripe.Customer;
        push({
          title: "3. Create the customer (no card)",
          prod: "99-web-listings → 99-stripe POST /v1/stripe/customers",
          request: { method: "POST", path: "/v1/customers", params },
          response: res,
          ...(res.ok
            ? { summary: [{ label: "Customer", value: customer.id }, { label: "Email", value: customer.email ?? "—" }] }
            : { error: stripeError(res) }),
        });
        if (!res.ok) return;
        customerId = customer.id;
        setCustomers((list) => (list ? [customer, ...list] : list));
        setPurchase((p) => ({ ...p, customer: customer.id }));
      }

      // 4. Create and confirm in one call — this replaces POST /v1/charges.
      //    payment_method_types must match the Element's paymentMethodTypes.
      //    Card PaymentIntents take statement_descriptor_suffix.
      const piParams = {
        amount: totalMinor,
        currency: "sgd",
        customer: customerId,
        description: purchase.title,
        statement_descriptor_suffix: descriptorSuffix,
        metadata: chargeMetadata(purchase, gstMinor, sourceRefId),
        payment_method_types: ["card"],
        confirmation_token: confirmationToken.id,
        confirm: true,
        expand: ["latest_charge"],
      };
      const piRes = await stripe.raw("POST", "/v1/payment_intents", piParams);
      const declined = (piRes.body as { error?: { payment_intent?: PaymentIntent } } | null)?.error?.payment_intent;
      const pi = (piRes.ok ? piRes.body : declined) as PaymentIntent | undefined;
      push({
        title: "4. Create and confirm the PaymentIntent",
        prod: CREATE_PI,
        request: { method: "POST", path: "/v1/payment_intents", params: piParams },
        response: piRes,
        ...(piRes.ok && pi ? { summary: paymentIntentSummary(pi) } : { error: stripeError(piRes) }),
      });
      if (!piRes.ok || !pi) return;
      if (pi.status === "succeeded") {
        setChargeId(chargeIdOf(pi));
        setPurchase((p) => ({ ...p, sourceRefId: "" }));
        return;
      }
      if (pi.status !== "requires_action" || !pi.client_secret) return;

      // 5. 3D Secure: only the customer can do this, in the browser.
      const { error: actionError, paymentIntent: afterAction } = await stripeJs.handleNextAction({
        clientSecret: pi.client_secret,
      });
      push({
        title: "5. 3D Secure in the browser",
        prod: "Browser: the backend returned requires_action + client_secret → stripe.handleNextAction",
        request: { method: "Stripe.js", path: "handleNextAction()", params: { clientSecret: "<from step 4>" } },
        ...(actionError
          ? { error: `${actionError.code ?? actionError.type}: ${actionError.message ?? ""}` }
          : {
              response: { status: 200, ok: true, body: afterAction } as RawResponse,
              summary: [{ label: "Status (as Stripe.js sees it)", value: afterAction?.status ?? "—" }],
            }),
      });

      // 6. The backend decides from Stripe's copy, never from the browser.
      const checkRes = await stripe.raw("GET", `/v1/payment_intents/${pi.id}`, { expand: ["latest_charge"] });
      const checked = checkRes.body as PaymentIntent;
      push({
        title: "6. Check the PaymentIntent",
        prod: "Browser calls 99-web-listings confirm → 99-stripe → Stripe GET /v1/payment_intents/{id}",
        request: { method: "GET", path: `/v1/payment_intents/${pi.id}`, params: { expand: ["latest_charge"] } },
        response: checkRes,
        ...(checkRes.ok ? { summary: paymentIntentSummary(checked) } : { error: stripeError(checkRes) }),
      });
      if (checkRes.ok && checked.status === "succeeded") {
        setChargeId(chargeIdOf(checked));
        setPurchase((p) => ({ ...p, sourceRefId: "" }));
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <MissingKeyNotice />

      <Notice>
        <strong>Current surface.</strong> The Payment Element is Stripe&apos;s pre-built
        UI, so no Dashboard tokenization setting is needed. Stripe.js is{" "}
        <Mono>@stripe/stripe-js</Mono> v6, pinned to <Mono>acacia</Mono>, matching the
        proxy&apos;s API version.
      </Notice>

      {loadError ? <ErrorBox message={loadError} /> : null}
      {error ? <ErrorBox message={error} /> : null}

      <form onSubmit={pay} className="flex max-w-lg flex-col gap-4">
        <PurchaseFields
          purchase={purchase}
          setPurchase={setPurchase}
          customers={customers}
          descriptorHint={`Sent as statement_descriptor_suffix: "${descriptorSuffix}". The card statement reads "<account prefix>* ${descriptorSuffix}".`}
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={running || !PUBLISHABLE_KEY}>
            {running ? "Processing…" : "Pay"}
          </Button>
        </div>
      </form>

      {cardModal.modal}

      <Steps steps={steps}>
        {chargeId ? (
          <Notice>
            <strong>Paid.</strong> In prod, 99-web-listings now marks the transaction
            paid. The PaymentIntent created a normal charge, so refunds and Xero keep
            working by charge id.{" "}
            <Link href={`/charges/${chargeId}`} className="font-medium underline">
              Open the charge →
            </Link>
          </Notice>
        ) : null}
      </Steps>

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Test cards: <Mono>4242 4242 4242 4242</Mono> no authentication,{" "}
        <Mono>4000 0027 6000 3184</Mono> 3D Secure every time,{" "}
        <Mono>4000 0082 6000 3178</Mono> authenticates then declines (insufficient funds),{" "}
        <Mono>4000 0000 0000 0002</Mono> declines.
      </p>
    </>
  );
}
