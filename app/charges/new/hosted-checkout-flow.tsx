"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe } from "@/lib/client";
import { cardLabel, type Charge } from "@/lib/charge";
import { formatAmount } from "@/lib/format";
import { Button, ErrorBox, Mono, Notice } from "@/components/ui";
import {
  DEFAULT_PURCHASE,
  MIN_AMOUNT,
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

export const HOSTED_CHECKOUT_FLOW = "hosted-checkout";

// Same TTL 99-stripe uses for X-Value sessions. Stripe allows 30 min to 24 h.
const SESSION_TTL_SECONDS = 3600;

// The page unloads on the redirect to Stripe, so the steps so far and the
// session id are parked in sessionStorage and picked up on the way back.
const STORAGE_KEY = "hosted-checkout-flow";

type Saved = { sessionId: string; steps: Step[] };

function load(): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(saved: Saved) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Private mode or blocked storage: the return page just shows fewer steps.
  }
}

type Session = Omit<Stripe.Checkout.Session, "payment_intent"> & {
  payment_intent:
    | string
    | (Omit<Stripe.PaymentIntent, "latest_charge"> & { latest_charge: Charge | string | null })
    | null;
};

function sessionSummary(session: Session): { label: string; value: string }[] {
  const pi = typeof session.payment_intent === "object" ? session.payment_intent : null;
  const charge = pi && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  return [
    { label: "Session", value: session.id },
    { label: "Status", value: session.status ?? "—" },
    { label: "Payment status", value: session.payment_status },
    { label: "Amount", value: formatAmount(session.amount_total, session.currency) },
    { label: "Transaction (client_reference_id)", value: session.client_reference_id ?? "—" },
    {
      label: "PaymentIntent",
      value: pi?.id ?? (typeof session.payment_intent === "string" ? session.payment_intent : "— none yet (created when the customer pays)"),
    },
    { label: "PaymentIntent status", value: pi?.status ?? "—" },
    { label: "Charge", value: charge?.id ?? "—" },
    { label: "Card", value: cardLabel(charge?.payment_method_details?.card) },
    { label: "On card statement", value: charge?.calculated_statement_descriptor ?? "—" },
  ];
}

function paidChargeId(session: Session): string | null {
  if (session.payment_status !== "paid") return null;
  const pi = typeof session.payment_intent === "object" ? session.payment_intent : null;
  if (!pi?.latest_charge) return null;
  return typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge.id;
}

/** Reads the session with its PaymentIntent and charge — what every sync path does. */
async function syncSession(
  sessionId: string,
  title: string,
  prod: string,
): Promise<{ step: Step; chargeId: string | null }> {
  const params = { expand: ["payment_intent.latest_charge"] };
  const res = await stripe.raw("GET", `/v1/checkout/sessions/${sessionId}`, params);
  const synced = res.body as Session;
  return {
    chargeId: res.ok ? paidChargeId(synced) : null,
    step: {
      title,
      prod,
      request: { method: "GET", path: `/v1/checkout/sessions/${sessionId}`, params },
      response: res,
      ...(res.ok ? { summary: sessionSummary(synced) } : { error: stripeError(res) }),
    },
  };
}

/**
 * Option B in ADR-0166: the backend creates a Checkout Session and the user
 * pays on Stripe's own page. Stripe collects the card, runs 3D Secure and
 * charges — the backend never triggers the charge itself.
 *
 *   1. backend   find or create the customer (no card)
 *   2. backend   POST /v1/checkout/sessions mode=payment → url
 *   3. browser   redirect to checkout.stripe.com; Stripe charges there
 *   4. browser   back on success_url?session_id=… → backend syncs the session
 *
 * Not built here: the checkout.session.completed webhook. Without it, a user
 * who pays and closes the tab is never fulfilled. "Check last session" shows
 * what a webhook or reconcile job would read.
 */
export function HostedCheckoutFlow({ searchParams }: FlowProps) {
  const { customers, setCustomers, error: loadError } = useCustomers();
  const [purchase, setPurchase] = useState<Purchase>(DEFAULT_PURCHASE);
  const [steps, setSteps] = useState<Step[]>([]);
  const [session, setSession] = useState<{ id: string; url: string } | null>(null);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = customers?.find((c) => c.id === purchase.customer) ?? null;
  const { finalMinor, gstMinor, totalMinor, descriptorSuffix } = amounts(purchase);
  const returned = searchParams.checkout;
  const returnedSessionId = searchParams.session_id;

  // Back from Stripe: restore the earlier steps, then sync (success) or note
  // the cancel. Only the success page knows the session id from Stripe.
  useEffect(() => {
    if (!returned) return;
    const saved = load();
    const before = saved?.steps ?? [];
    const sessionId = returnedSessionId ?? saved?.sessionId ?? null;

    if (returned === "success" && sessionId) {
      syncSession(
        sessionId,
        "4. Back on the success page — sync the session",
        "Browser → 99-web-listings confirm-transaction → 99-stripe sync-session → Stripe GET /v1/checkout/sessions/{id}",
      ).then(({ step, chargeId: paid }) => {
        setSteps([...before, step]);
        setLastSessionId(sessionId);
        setChargeId(paid);
      });
      return;
    }

    if (returned === "cancelled") {
      Promise.resolve().then(() => {
        setSteps([
          ...before,
          {
            title: "4. Back on the cancel page",
            prod: "Browser → cancel_url. Nothing was charged; the transaction stays pending.",
            summary: [
              { label: "Session", value: sessionId ?? "—" },
              { label: "What happens next", value: "The session stays open until it expires. Expire it now, or start over (retry-transaction)." },
            ],
          },
        ]);
        setLastSessionId(sessionId);
      });
    }
  }, [returned, returnedSessionId]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setSteps([]);
    setSession(null);
    setChargeId(null);
    setError(null);

    if (totalMinor < MIN_AMOUNT) {
      setError(`99-stripe rejects charges under ${formatAmount(MIN_AMOUNT, "sgd")} (invalid_amount).`);
      return;
    }
    setRunning(true);
    const sourceRefId = purchase.sourceRefId || `txn_${Date.now()}`;
    const done: Step[] = [];
    const push = (step: Step) => {
      done.push(step);
      setSteps([...done]);
    };

    try {
      // 1. The customer only labels the payment — the card is typed on Stripe's page.
      let customerId: string;
      if (selected) {
        customerId = selected.id;
        push({
          title: "1. Use the agent's existing customer",
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
          title: "1. Create the customer (no card)",
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

      // 2. One session per transaction. The amount is ours (price + GST, as
      //    two lines so Stripe's page shows the split); Stripe never computes
      //    tax here. payment_intent_data reaches the PaymentIntent Stripe
      //    creates on payment — that is where the descriptor and metadata go.
      //    {CHECKOUT_SESSION_ID} is filled in by Stripe on the success redirect.
      const origin = window.location.origin;
      const base = `${origin}/charges/new?flow=${HOSTED_CHECKOUT_FLOW}`;
      const metadata = chargeMetadata(purchase, gstMinor, sourceRefId);
      const params = {
        mode: "payment",
        customer: customerId,
        client_reference_id: sourceRefId,
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: { currency: "sgd", unit_amount: finalMinor, product_data: { name: purchase.title } },
          },
          ...(gstMinor
            ? [
                {
                  quantity: 1,
                  price_data: { currency: "sgd", unit_amount: gstMinor, product_data: { name: `GST ${purchase.gstRate}%` } },
                },
              ]
            : []),
        ],
        payment_intent_data: {
          description: purchase.title,
          statement_descriptor_suffix: descriptorSuffix,
          metadata,
        },
        metadata,
        expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
        success_url: `${base}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}&checkout=cancelled`,
      };
      const res = await stripe.raw("POST", "/v1/checkout/sessions", params);
      const created = res.body as Session;
      push({
        title: "2. Create the Checkout Session",
        prod: "99-web-listings complete-transaction → 99-stripe create-checkout-session → Stripe POST /v1/checkout/sessions",
        request: { method: "POST", path: "/v1/checkout/sessions", params },
        response: res,
        ...(res.ok
          ? {
              summary: [
                { label: "Session", value: created.id },
                { label: "Amount", value: formatAmount(created.amount_total, created.currency) },
                { label: "PaymentIntent", value: typeof created.payment_intent === "string" ? created.payment_intent : "— none yet (created when the customer pays)" },
                { label: "Expires", value: created.expires_at ? new Date(created.expires_at * 1000).toLocaleString() : "—" },
              ],
            }
          : { error: stripeError(res) }),
      });
      if (!res.ok || !created.url) return;

      // In prod, 99-stripe saves session_id on the pending charge row here.
      save({ sessionId: created.id, steps: done });
      setSession({ id: created.id, url: created.url });
      setLastSessionId(created.id);
      setPurchase((p) => ({ ...p, sourceRefId: "" }));
    } finally {
      setRunning(false);
    }
  }

  async function checkLastSession() {
    if (!lastSessionId) return;
    const { step, chargeId: paid } = await syncSession(
      lastSessionId,
      "Check last session (what the webhook / reconcile job would read)",
      "Not built: 99-stripe on checkout.session.completed, or a job over pending rows → Stripe GET /v1/checkout/sessions/{id}",
    );
    setSteps((s) => [...s, step]);
    setChargeId(paid);
  }

  async function expireLastSession() {
    if (!lastSessionId) return;
    const res = await stripe.raw("POST", `/v1/checkout/sessions/${lastSessionId}/expire`);
    setSteps((s) => [
      ...s,
      {
        title: "Expire the session",
        prod: "99-stripe expire-checkout-session (already used for X-Value)",
        request: { method: "POST", path: `/v1/checkout/sessions/${lastSessionId}/expire`, params: {} },
        response: res,
        ...(res.ok
          ? { summary: [{ label: "Status", value: (res.body as Session).status ?? "—" }] }
          : { error: stripeError(res) }),
      },
    ]);
  }

  return (
    <>
      <Notice>
        <strong>No card form here and no publishable key.</strong> The card is typed
        on <Mono>checkout.stripe.com</Mono>; Stripe runs 3D Secure and charges.{" "}
        <strong>No webhook in this POC:</strong> pay, then close the Stripe tab instead
        of returning, and nothing here learns the payment happened until you press
        &ldquo;Check last session&rdquo;.
      </Notice>

      {loadError ? <ErrorBox message={loadError} /> : null}
      {error ? <ErrorBox message={error} /> : null}

      <form onSubmit={start} className="flex max-w-lg flex-col gap-4">
        <PurchaseFields
          purchase={purchase}
          setPurchase={setPurchase}
          customers={customers}
          descriptorHint={`Sent as payment_intent_data.statement_descriptor_suffix: "${descriptorSuffix}".`}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={running}>
            {running ? "Creating session…" : "Proceed to payment"}
          </Button>
          {lastSessionId ? (
            <>
              <Button variant="secondary" onClick={checkLastSession}>
                Check last session
              </Button>
              <Button variant="secondary" onClick={expireLastSession}>
                Expire last session
              </Button>
            </>
          ) : null}
        </div>
      </form>

      <Steps steps={steps}>
        {session ? (
          <Notice>
            <strong>3. Redirect to Stripe.</strong> In prod the SPA does this right
            away; here it waits so you can read the steps first.{" "}
            <a href={session.url} className="font-medium underline">
              Continue to Stripe Checkout →
            </a>
          </Notice>
        ) : null}
        {chargeId ? (
          <Notice>
            <strong>Paid.</strong> In prod, 99-web-listings now marks the transaction
            paid. It is a normal charge, so refunds and Xero keep working by charge id.{" "}
            <Link href={`/charges/${chargeId}`} className="font-medium underline">
              Open the charge →
            </Link>
          </Notice>
        ) : null}
      </Steps>

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Test cards on Stripe&apos;s page: <Mono>4242 4242 4242 4242</Mono> no authentication,{" "}
        <Mono>4000 0027 6000 3184</Mono> 3D Secure every time,{" "}
        <Mono>4000 0082 6000 3178</Mono> authenticates then declines,{" "}
        <Mono>4000 0000 0000 0002</Mono> declines (Stripe&apos;s page lets the user try another card).
      </p>
    </>
  );
}
