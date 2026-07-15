"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { api } from "@/lib/client";
import { formatAmount, formatDate } from "@/lib/format";
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
  PageHeader,
  Row,
  Table,
} from "@/components/ui";

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [product, setProduct] = useState<Stripe.Product | null>(null);
  const [prices, setPrices] = useState<Stripe.Price[] | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Stripe.Product>(`/api/products/${id}`)
      .then((p) => {
        setProduct(p);
        setForm({ name: p.name ?? "", description: p.description ?? "" });
      })
      .catch((e: Error) => setError(e.message));

    api
      .get<Stripe.Price[]>(`/api/prices?product=${id}`)
      .then(setPrices)
      .catch(() => setPrices([]));
  }, [id]);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setProduct(await api.patch<Stripe.Product>(`/api/products/${id}`, form));
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      setProduct(
        await api.patch<Stripe.Product>(`/api/products/${id}`, {
          active: !product.active,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this product permanently?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/api/products/${id}`);
      router.push("/products");
    } catch (err) {
      // Stripe refuses a hard delete once any price references the product.
      setError(`${(err as Error).message} — archive it instead.`);
      setBusy(false);
    }
  }

  if (error && !product) return <ErrorBox message={error} />;
  if (!product) return <Loading />;

  return (
    <>
      <PageHeader
        title={product.name}
        description={product.id}
        action={
          <div className="flex gap-2">
            {!editing ? (
              <Button onClick={() => setEditing(true)}>Edit</Button>
            ) : null}
            <Button variant="secondary" onClick={toggleArchive} disabled={busy}>
              {product.active ? "Archive" : "Unarchive"}
            </Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              Delete
            </Button>
            <LinkButton href="/products" variant="secondary">
              Back
            </LinkButton>
          </div>
        }
      />

      {error ? <ErrorBox message={error} /> : null}

      {editing ? (
        <form onSubmit={save} className="flex max-w-lg flex-col gap-4">
          <Field label="Name">
            <Input value={form.name} onChange={set("name")} required />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={set("description")} />
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
            { label: "ID", value: <Mono>{product.id}</Mono> },
            { label: "Name", value: product.name },
            { label: "Description", value: product.description || "—" },
            { label: "Status", value: <Badge active={product.active} /> },
            { label: "Created", value: formatDate(product.created) },
          ]}
        />
      )}

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Prices
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              A subscription is created against one of these price IDs.
            </p>
          </div>
          <LinkButton href={`/prices/new?product=${product.id}`} variant="secondary">
            Add price
          </LinkButton>
        </div>

        {!prices ? (
          <Loading />
        ) : (
          <Table
            headers={["Amount", "Billing", "Status", "ID"]}
            isEmpty={prices.length === 0}
            empty="No prices for this product yet."
          >
            {prices.map((p) => (
              <Row
                key={p.id}
                href={`/prices/${p.id}`}
                cells={[
                  formatAmount(p.unit_amount, p.currency),
                  p.recurring ? `every ${p.recurring.interval}` : "one-time",
                  <Badge key="s" active={p.active} />,
                  <Mono key="id">{p.id}</Mono>,
                ]}
              />
            ))}
          </Table>
        )}
      </div>

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Deleting only works while no price has ever referenced this product.
        Once one has, Stripe requires archiving instead.
      </p>
    </>
  );
}
