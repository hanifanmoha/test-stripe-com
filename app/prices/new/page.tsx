"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type StripeList } from "@/lib/client";
import { minorPerUnit, toMinorUnits } from "@/lib/format";
import {
  Button,
  ErrorBox,
  Field,
  Input,
  LinkButton,
  Notice,
  PageHeader,
  Select,
} from "@/components/ui";

const CURRENCIES = ["usd", "eur", "gbp", "sgd", "idr", "jpy"];

export default function NewPricePage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product: presetProduct } = use(searchParams);
  const router = useRouter();

  const [products, setProducts] = useState<Stripe.Product[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    product: presetProduct ?? "",
    amount: "",
    currency: "usd",
    interval: "month",
    nickname: "",
  });

  useEffect(() => {
    stripe
      .get<StripeList<Stripe.Product>>("/v1/products", { limit: 100 })
      .then((res) => {
        const active = res.data.filter((p) => p.active);
        setProducts(active);
        setForm((f) =>
          f.product || active.length === 0 ? f : { ...f, product: active[0].id },
        );
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const set =
    (key: keyof typeof form) => (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Stripe-native shape: a recurring price nests `recurring[interval]`; a
      // one-time price simply omits `recurring`. This is exactly the request
      // the server used to assemble — now the page builds it, so it's visible.
      const params: Record<string, unknown> = {
        product: form.product,
        currency: form.currency,
        unit_amount: toMinorUnits(form.amount, form.currency),
        nickname: form.nickname,
      };
      if (form.interval !== "one_time") {
        params.recurring = { interval: form.interval };
      }

      const created = await stripe.post<Stripe.Price>("/v1/prices", params);
      router.push(`/prices/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const zeroDecimal = minorPerUnit(form.currency) === 1;

  return (
    <>
      <PageHeader
        title="New price"
        description="Amount, currency, and billing interval are permanent once saved."
      />

      {error ? <ErrorBox message={error} /> : null}

      {products && products.length === 0 ? (
        <Notice>
          No active products yet — a price must belong to one.{" "}
          <Link href="/products/new" className="font-medium underline">
            Create a product first.
          </Link>
        </Notice>
      ) : null}

      <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
        <Field label="Product">
          <Select value={form.product} onChange={set("product")} required>
            {!products ? <option>Loading…</option> : null}
            {products?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Currency">
          <Select value={form.currency} onChange={set("currency")}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Amount"
          hint={
            zeroDecimal
              ? `${form.currency.toUpperCase()} is a zero-decimal currency — enter a whole number.`
              : `Sent to Stripe in minor units (e.g. 20.00 → ${toMinorUnits("20.00", form.currency)}).`
          }
        >
          <Input
            type="number"
            step={zeroDecimal ? "1" : "0.01"}
            min="0"
            value={form.amount}
            onChange={set("amount")}
            placeholder={zeroDecimal ? "2000" : "20.00"}
            required
          />
        </Field>

        <Field label="Billing">
          <Select value={form.interval} onChange={set("interval")}>
            <option value="day">Recurring — daily</option>
            <option value="week">Recurring — weekly</option>
            <option value="month">Recurring — monthly</option>
            <option value="year">Recurring — yearly</option>
            <option value="one_time">One-time</option>
          </Select>
        </Field>

        <Field label="Nickname" hint="Internal label. One of the few editable fields.">
          <Input value={form.nickname} onChange={set("nickname")} />
        </Field>

        <div className="mt-2 flex gap-2">
          <Button type="submit" disabled={saving || !form.product}>
            {saving ? "Creating…" : "Create price"}
          </Button>
          <LinkButton href="/prices" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </>
  );
}
