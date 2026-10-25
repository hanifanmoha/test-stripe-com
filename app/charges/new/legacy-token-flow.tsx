"use client";

import Link from "next/link";
import { useState } from "react";
import type Stripe from "stripe";
import { stripe } from "@/lib/client";
import { openLegacyCheckout, type LegacyToken } from "@/lib/checkout-js";
import { cardLabel, type Charge } from "@/lib/charge";
import { formatAmount } from "@/lib/format";
import { Button, ErrorBox, Mono, Notice } from "@/components/ui";
import {
  DEFAULT_PURCHASE,
  DESCRIPTOR_MAX,
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
  type Purchase,
  type Step,
} from "./shared";

const TOKENIZE = "1. Tokenize the card";
const TOKENIZE_PROD = "Browser: react-stripe-checkout → checkout.js (publishable key)";

/**
 * Mirrors the one-off card payment in 99-spa / 99-spa-v2 today:
 *
 *   1. browser   react-stripe-checkout → checkout.js modal → token (publishable key)
 *   2. backend   99-web-listings complete-transaction → 99-stripe → save the token
 *                as the customer's default card (update, or create the customer)
 *   3. backend   99-web-listings → 99-stripe → POST /v1/charges on that customer
 *
 * Steps 2 and 3 are server-side in prod; here the page sends the same Stripe
 * requests through the proxy so each one is visible.
 */
export function LegacyTokenFlow() {
  const { customers, setCustomers, error: loadError } = useCustomers();
  const [purchase, setPurchase] = useState<Purchase>(DEFAULT_PURCHASE);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = customers?.find((c) => c.id === purchase.customer) ?? null;
  const { finalMinor, gstMinor, totalMinor, descriptor } = amounts(purchase);
  const modalEmail = selected ? selected.email ?? "" : purchase.email;

  const push = (step: Step) => setSteps((s) => [...s, step]);

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
      // 1. The card never touches our code: the modal posts it to Stripe and
      //    returns a token. `amount` is display-only — the modal charges nothing.
      const modal = {
        name: "99.co",
        description: `Payment for ${purchase.title || "package"}`,
        currency: "SGD",
        email: modalEmail,
        amount: finalMinor,
        allowRememberMe: false,
      };
      const request = { method: "checkout.js", path: "StripeCheckout.open()", params: modal };
      let token: LegacyToken | null;
      try {
        token = await openLegacyCheckout(PUBLISHABLE_KEY, modal);
      } catch (err) {
        push({ title: TOKENIZE, prod: TOKENIZE_PROD, request, error: (err as Error).message });
        return;
      }
      if (!token) {
        push({
          title: TOKENIZE,
          prod: TOKENIZE_PROD,
          request,
          error: "Modal closed without a card. Nothing was sent to the backend.",
        });
        return;
      }
      push({
        title: TOKENIZE,
        prod: TOKENIZE_PROD,
        request,
        response: { status: 200, ok: true, body: token },
        summary: [
          { label: "Token", value: token.id },
          { label: "Card", value: cardLabel(token.card) },
          { label: "Email typed in modal", value: token.email || "—" },
        ],
      });

      // 2. Save the token as the customer's default card. An existing customer
      //    gets its card replaced; otherwise the customer is created with it.
      //    expand[]=sources: since 2020-08-27 the card list is not returned by
      //    default, and 99-stripe reads card_info from it.
      const customerRequest = selected
        ? {
            method: "POST",
            path: `/v1/customers/${selected.id}`,
            params: { source: token.id, expand: ["sources"] },
            prod: "99-web-listings → 99-stripe PUT /v1/stripe/customers/{id} (stripe_card_token)",
          }
        : {
            method: "POST",
            path: "/v1/customers",
            params: { source: token.id, ...newCustomerParams(purchase), expand: ["sources"] },
            prod: "99-web-listings → 99-stripe POST /v1/stripe/customers (no customer for this agent yet)",
          };
      const customerRes = await stripe.raw("POST", customerRequest.path, customerRequest.params);
      const customer = customerRes.body as Stripe.Customer & {
        sources?: { data?: Array<{ brand?: string; last4?: string; exp_month?: number; exp_year?: number }> };
      };
      push({
        title: selected ? "2. Replace the customer's card" : "2. Create the customer with the card",
        prod: customerRequest.prod,
        request: customerRequest,
        response: customerRes,
        ...(customerRes.ok
          ? {
              summary: [
                { label: "Customer", value: customer.id },
                { label: "Default card", value: cardLabel(customer.sources?.data?.[0]) },
                { label: "Email", value: customer.email ?? "—" },
              ],
            }
          : { error: stripeError(customerRes) }),
      });
      if (!customerRes.ok) return;
      if (!selected) {
        setCustomers((list) => (list ? [customer, ...list] : list));
        setPurchase((p) => ({ ...p, customer: customer.id }));
      }

      // 3. Charge the customer. No `source` param: Stripe charges the default
      //    card saved in step 2. 99-stripe adds source / source_ref_id to the
      //    metadata and refuses a second charge for the same pair.
      const chargeParams = {
        amount: totalMinor,
        currency: "SGD",
        customer: customer.id,
        description: purchase.title,
        statement_descriptor: descriptor,
        metadata: chargeMetadata(purchase, gstMinor, sourceRefId),
      };
      const chargeRes = await stripe.raw("POST", "/v1/charges", chargeParams);
      const charge = chargeRes.body as Charge;
      push({
        title: "3. Charge the customer",
        prod: "99-web-listings → 99-stripe POST /v1/stripe/charges → Stripe POST /v1/charges",
        request: { method: "POST", path: "/v1/charges", params: chargeParams },
        response: chargeRes,
        ...(chargeRes.ok
          ? {
              summary: [
                { label: "Charge", value: charge.id },
                { label: "Status", value: charge.status },
                { label: "Amount", value: formatAmount(charge.amount, charge.currency) },
                { label: "Card (charge.source)", value: charge.source ? cardLabel(charge.source) : "— not returned" },
                { label: "Card (payment_method_details)", value: cardLabel(charge.payment_method_details?.card) },
                { label: "On card statement", value: charge.calculated_statement_descriptor ?? "—" },
                { label: "Receipt number", value: charge.receipt_number ?? "— (test mode sends none)" },
              ],
            }
          : { error: stripeError(chargeRes) }),
      });
      if (chargeRes.ok) {
        setChargeId(charge.id);
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
        <strong>Legacy surface.</strong> <Mono>checkout.js</Mono> creates the token with
        the publishable key, which new accounts block. If the modal fails with
        &ldquo;This integration surface is unsupported for publishable key
        tokenization&rdquo;, enable &ldquo;Enable card data collection with a
        publishable key without using Stripe&apos;s pre-built UI elements&rdquo; at{" "}
        <a
          href="https://dashboard.stripe.com/settings/integration"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
        >
          dashboard.stripe.com/settings/integration
        </a>
        . The token call runs on the account default version; steps 2 and 3 run on
        the proxy&apos;s pinned version.
      </Notice>

      {loadError ? <ErrorBox message={loadError} /> : null}
      {error ? <ErrorBox message={error} /> : null}

      <form onSubmit={pay} className="flex max-w-lg flex-col gap-4">
        <PurchaseFields
          purchase={purchase}
          setPurchase={setPurchase}
          customers={customers}
          descriptorHint={`Sent as statement_descriptor, cut to ${DESCRIPTOR_MAX}: "${descriptor}" (${descriptor.length}).`}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={running || !PUBLISHABLE_KEY}>
            {running ? "Processing…" : "Proceed to payment"}
          </Button>
        </div>
      </form>

      <Steps steps={steps}>
        {chargeId ? (
          <Notice>
            <strong>Charged.</strong> In prod, 99-web-listings now marks the
            transaction paid with this charge as its <Mono>source_id</Mono>.{" "}
            <Link href={`/charges/${chargeId}`} className="font-medium underline">
              Open the charge →
            </Link>
          </Notice>
        ) : null}
      </Steps>

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Test cards: <Mono>4242 4242 4242 4242</Mono> succeeds,{" "}
        <Mono>4000 0000 0000 0002</Mono> declines,{" "}
        <Mono>4000 0027 6000 3184</Mono> needs 3D Secure, which this flow cannot do.
      </p>
    </>
  );
}
