"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { api } from "@/lib/client";
import { formatAmount } from "@/lib/format";
import {
  Button,
  ErrorBox,
  Field,
  LinkButton,
  Notice,
  PageHeader,
  Select,
} from "@/components/ui";

export default function NewSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  // Preselected when arriving from a customer's detail page.
  const { customer: presetCustomer } = use(searchParams);

  const [customers, setCustomers] = useState<Stripe.Customer[] | null>(null);
  const [prices, setPrices] = useState<Stripe.Price[] | null>(null);
  const [customer, setCustomer] = useState(presetCustomer ?? "");
  const [price, setPrice] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Stripe.Customer[]>("/api/customers")
      .then((all) => {
        setCustomers(all);
        setCustomer((c) => c || all[0]?.id || "");
      })
      .catch((e: Error) => setError(e.message));

    api
      .get<Stripe.Price[]>("/api/prices")
      .then((all) => {
        // Checkout's `subscription` mode only accepts recurring prices, and an
        // archived price can't be subscribed to at all.
        const usable = all.filter((p) => p.recurring && p.active);
        setPrices(usable);
        setPrice((p) => p || usable[0]?.id || "");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function startCheckout(e: React.FormEvent) {
    e.preventDefault();
    setRedirecting(true);
    setError(null);
    try {
      const { url } = await api.post<{ url: string }>("/api/checkout", {
        customer,
        price,
      });
      // A full-page navigation, not router.push — this leaves our origin for
      // Stripe's domain, which the client router can't do.
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setRedirecting(false);
    }
  }

  const noCustomers = customers?.length === 0;
  const noPrices = prices?.length === 0;

  return (
    <>
      <PageHeader
        title="New subscription"
        description="Hands off to Stripe's hosted Checkout page to collect payment."
      />

      {error ? <ErrorBox message={error} /> : null}

      {noCustomers ? (
        <Notice>
          No customers yet.{" "}
          <Link href="/customers/new" className="font-medium underline">
            Create one first.
          </Link>
        </Notice>
      ) : null}
      {noPrices ? (
        <Notice>
          No active recurring prices. A subscription needs a price with a billing
          interval — one-time prices can&apos;t be subscribed to.{" "}
          <Link href="/products" className="font-medium underline">
            Add a recurring price to a product.
          </Link>
        </Notice>
      ) : null}

      <form onSubmit={startCheckout} className="flex max-w-lg flex-col gap-4">
        <Field label="Customer">
          <Select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            required
          >
            {!customers ? <option>Loading…</option> : null}
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.email || c.id}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Price" hint="Only active recurring prices can be subscribed to.">
          <Select value={price} onChange={(e) => setPrice(e.target.value)} required>
            {!prices ? <option>Loading…</option> : null}
            {prices?.map((p) => (
              <option key={p.id} value={p.id}>
                {formatAmount(p.unit_amount, p.currency)}
                {p.recurring ? ` / ${p.recurring.interval}` : ""}
                {p.nickname ? ` — ${p.nickname}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Notice>
          <strong>You&apos;ll be sent to Stripe to pay.</strong> The subscription
          doesn&apos;t exist until checkout completes — Stripe creates it, then
          returns you here. Use test card <Mono>4242 4242 4242 4242</Mono> with
          any future expiry and any CVC.
          <br />
          <a
            href="https://docs.stripe.com/testing?testing-method=card-numbers#cards"
            // New tab: this form's state would be lost on a same-tab navigation.
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-medium underline"
          >
            All test cards →
          </a>{" "}
          <span className="text-xs">
            including cards that decline, require 3D Secure, or fail on renewal.
          </span>
        </Notice>

        <div className="mt-2 flex gap-2">
          <Button
            type="submit"
            disabled={redirecting || !customer || !price || noCustomers || noPrices}
          >
            {redirecting ? "Redirecting to Stripe…" : "Continue to Checkout"}
          </Button>
          <LinkButton href="/subscriptions" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-900">
      {children}
    </code>
  );
}
