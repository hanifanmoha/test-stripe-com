"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { api } from "@/lib/client";
import { formatAmount, formatDate, toMajorUnits } from "@/lib/format";
import {
  Badge,
  Button,
  DetailList,
  ErrorBox,
  Field,
  Input,
  LinkButton,
  Loading,
  Mono,
  Notice,
  PageHeader,
} from "@/components/ui";

export default function PricePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [price, setPrice] = useState<Stripe.Price | null>(null);
  const [nickname, setNickname] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Stripe.Price>(`/api/prices/${id}`)
      .then((p) => {
        setPrice(p);
        setNickname(p.nickname ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setPrice(await api.patch<Stripe.Price>(`/api/prices/${id}`, { nickname }));
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!price) return;
    setBusy(true);
    setError(null);
    try {
      setPrice(
        await api.patch<Stripe.Price>(`/api/prices/${id}`, {
          active: !price.active,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !price) return <ErrorBox message={error} />;
  if (!price) return <Loading />;

  const productId =
    typeof price.product === "object" ? price.product.id : price.product;
  const productName =
    typeof price.product === "object" && "name" in price.product
      ? price.product.name
      : productId;

  return (
    <>
      <PageHeader
        title={formatAmount(price.unit_amount, price.currency)}
        description={price.nickname || price.id}
        action={
          <div className="flex gap-2">
            {!editing ? (
              <Button onClick={() => setEditing(true)}>Edit</Button>
            ) : null}
            <Button variant="secondary" onClick={toggleArchive} disabled={busy}>
              {price.active ? "Archive" : "Unarchive"}
            </Button>
            <LinkButton href="/prices" variant="secondary">
              Back
            </LinkButton>
          </div>
        }
      />

      {error ? <ErrorBox message={error} /> : null}

      <Notice>
        <strong>Prices can&apos;t be deleted or repriced.</strong> Amount,
        currency, and interval are frozen at creation because live subscriptions
        bill against this price ID — changing them would silently re-bill
        existing subscribers. To change an amount, archive this price and{" "}
        <Link
          href={`/prices/new?product=${productId}`}
          className="font-medium underline"
        >
          create a new one
        </Link>
        . Archiving hides it from new checkouts; existing subscriptions keep
        billing on it.
      </Notice>

      {editing ? (
        <form onSubmit={save} className="flex max-w-lg flex-col gap-4">
          <Field label="Nickname" hint="The only free-text field Stripe lets you change.">
            <Input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </Field>
          <Field label="Amount" hint="Immutable — shown for reference only.">
            <Input
              value={toMajorUnits(price.unit_amount ?? 0, price.currency)}
              disabled
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <DetailList
          items={[
            { label: "ID", value: <Mono>{price.id}</Mono> },
            {
              label: "Product",
              value: (
                <Link
                  href={`/products/${productId}`}
                  className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  {productName}
                </Link>
              ),
            },
            {
              label: "Amount",
              value: formatAmount(price.unit_amount, price.currency),
            },
            { label: "Currency", value: price.currency.toUpperCase() },
            {
              label: "Billing",
              value: price.recurring
                ? `Recurring — every ${price.recurring.interval}`
                : "One-time",
            },
            { label: "Nickname", value: price.nickname || "—" },
            { label: "Status", value: <Badge active={price.active} /> },
            { label: "Created", value: formatDate(price.created) },
          ]}
        />
      )}
    </>
  );
}
