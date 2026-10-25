"use client";

import { useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type RawResponse, type StripeList } from "@/lib/client";
import { formatAmount, toMinorUnits } from "@/lib/format";
import { Field, Input, JsonBlock, Mono, Notice, Select } from "@/components/ui";

/** Every charge flow takes these. Flows that ignore them simply don't read them. */
export type FlowProps = { searchParams: Record<string, string | undefined> };

export const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

// 99-stripe rejects charges under 50 cents and cuts the descriptor to 22 chars.
export const MIN_AMOUNT = 50;
export const DESCRIPTOR_MAX = 22;
const BRAND_PREFIX = "99.CO - ";

const SOURCES = [
  "subscription",
  "credit",
  "add_on",
  "project_marketing",
  "must_see_free_weeks",
  "new_launch_premier",
  "area_advisor",
  "special_credit",
];

/** What 99-web-listings knows about the purchase before it calls 99-stripe. */
export type Purchase = {
  customer: string;
  name: string;
  email: string;
  agentNumber: string;
  title: string;
  productId: string;
  finalPrice: string;
  gstRate: string;
  descriptor: string;
  source: string;
  sourceRefId: string;
};

export const DEFAULT_PURCHASE: Purchase = {
  customer: "",
  name: "",
  email: "",
  agentNumber: "",
  title: "Platinum Plan (1 year)",
  productId: "platinum_v1",
  finalPrice: "100.00",
  gstRate: "9",
  descriptor: "99.CO - PLT PLN - 1YR",
  source: "subscription",
  sourceRefId: "",
};

export function amounts(p: Purchase) {
  const finalMinor = toMinorUnits(p.finalPrice || "0", "sgd");
  const gstMinor = Math.round((finalMinor * Number(p.gstRate || 0)) / 100);
  const descriptor = p.descriptor.slice(0, DESCRIPTOR_MAX);
  return {
    finalMinor,
    gstMinor,
    totalMinor: finalMinor + gstMinor,
    descriptor,
    // Card statements read "<account prefix>* <suffix>", so the brand is dropped.
    descriptorSuffix: descriptor.startsWith(BRAND_PREFIX)
      ? descriptor.slice(BRAND_PREFIX.length)
      : descriptor,
  };
}

/** The metadata 99-web-listings sends plus the two keys 99-stripe adds. */
export function chargeMetadata(p: Purchase, gstMinor: number, sourceRefId: string) {
  return {
    product_id: p.productId,
    gst_amount: String(gstMinor / 100),
    gst_rate: p.gstRate,
    source: p.source,
    source_ref_id: sourceRefId,
  };
}

/** The fields 99-stripe sends when it creates a customer. */
export function newCustomerParams(p: Purchase) {
  return {
    description: p.name,
    email: p.email,
    address: { country: "SG" },
    metadata: { agent_number: p.agentNumber },
  };
}

export function stripeError(res: RawResponse): string {
  const error = (res.body as {
    error?: { type?: string; code?: string; decline_code?: string; message?: string };
  } | null)?.error;
  return [error?.type, error?.code, error?.decline_code, error?.message]
    .filter(Boolean)
    .join(" · ");
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Stripe.Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<StripeList<Stripe.Customer>>("/v1/customers", { limit: 100 })
      .then((res) => setCustomers(res.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return { customers, setCustomers, error };
}

export function MissingKeyNotice() {
  if (PUBLISHABLE_KEY) return null;
  return (
    <Notice>
      <strong>No publishable key.</strong> Set{" "}
      <Mono>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…</Mono> in{" "}
      <Mono>.env.local</Mono> (same account as the secret key) and restart{" "}
      <Mono>npm run dev</Mono>.
    </Notice>
  );
}

export function PurchaseFields({
  purchase,
  setPurchase,
  customers,
  descriptorHint,
}: {
  purchase: Purchase;
  setPurchase: React.Dispatch<React.SetStateAction<Purchase>>;
  customers: Stripe.Customer[] | null;
  descriptorHint: string;
}) {
  const set = (key: keyof Purchase) => (e: { target: { value: string } }) =>
    setPurchase((p) => ({ ...p, [key]: e.target.value }));
  const selected = customers?.find((c) => c.id === purchase.customer) ?? null;
  const { finalMinor, gstMinor, totalMinor } = amounts(purchase);

  return (
    <>
      <Field
        label="Customer"
        hint="In prod: the Stripe customer 99-stripe holds for the agent. None yet → it is created."
      >
        <Select value={purchase.customer} onChange={set("customer")}>
          <option value="">— New customer —</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.email || c.id}
            </option>
          ))}
        </Select>
      </Field>

      {!selected ? (
        <>
          <Field label="Name" hint="Sent as the customer description.">
            <Input value={purchase.name} onChange={set("name")} placeholder="Agent name" />
          </Field>
          <Field label="Email">
            <Input type="email" value={purchase.email} onChange={set("email")} placeholder="agent@example.com" />
          </Field>
          <Field label="Agent number" hint="metadata[agent_number]">
            <Input value={purchase.agentNumber} onChange={set("agentNumber")} />
          </Field>
        </>
      ) : null}

      <Field label="Package title" hint="Charge description, shown on the email receipt.">
        <Input value={purchase.title} onChange={set("title")} required />
      </Field>
      <Field label="Product id" hint="metadata[product_id]">
        <Input value={purchase.productId} onChange={set("productId")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Final price (SGD)" hint="Before GST.">
          <Input type="number" min="0" step="0.01" value={purchase.finalPrice} onChange={set("finalPrice")} required />
        </Field>
        <Field label="GST rate (%)">
          <Input type="number" min="0" step="0.01" value={purchase.gstRate} onChange={set("gstRate")} />
        </Field>
      </div>
      <Field label="Statement descriptor" hint={descriptorHint}>
        <Input value={purchase.descriptor} onChange={set("descriptor")} required />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Source" hint="metadata[source], the product type.">
          <Select value={purchase.source} onChange={set("source")}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Transaction id" hint="metadata[source_ref_id]. Empty → txn_<timestamp>.">
          <Input value={purchase.sourceRefId} onChange={set("sourceRefId")} placeholder="generated on pay" />
        </Field>
      </div>

      <div className="rounded-md border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
        <div className="flex justify-between">
          <span className="text-zinc-500 dark:text-zinc-400">Final price</span>
          <span>{formatAmount(finalMinor, "sgd")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500 dark:text-zinc-400">GST {purchase.gstRate || 0}%</span>
          <span>{formatAmount(gstMinor, "sgd")}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-zinc-200 pt-1 font-medium dark:border-zinc-800">
          <span>Charged</span>
          <span>{formatAmount(totalMinor, "sgd")}</span>
        </div>
      </div>
    </>
  );
}

export type Step = {
  title: string;
  prod: string;
  request?: { method: string; path: string; params: unknown };
  response?: RawResponse;
  summary?: { label: string; value: string }[];
  error?: string;
};

export function Steps({ steps, children }: { steps: Step[]; children?: React.ReactNode }) {
  if (!steps.length) return null;
  return (
    <div className="mt-8 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Steps</h2>
      {steps.map((step, i) => (
        <StepCard key={`${i}-${step.title}`} step={step} />
      ))}
      {children}
    </div>
  );
}

function StepCard({ step }: { step: Step }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        step.error ? "border-red-300 dark:border-red-900" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{step.title}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">In prod: {step.prod}</div>
        </div>
        {step.request ? (
          <Mono>
            {step.request.method} {step.request.path}
            {step.response ? ` → ${step.response.status}` : ""}
          </Mono>
        ) : null}
      </div>

      {step.summary ? (
        <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
          {step.summary.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd className="col-span-2 text-zinc-900 dark:text-zinc-100">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {step.error ? <div className="mt-3 text-sm text-red-700 dark:text-red-300">{step.error}</div> : null}

      {step.request ? <JsonBlock label="Request params" value={step.request.params} /> : null}
      {step.response ? <JsonBlock label="Raw response" value={step.response.body} /> : null}
    </div>
  );
}
