"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type StripeList } from "@/lib/client";
import { formatAmount, formatDate, periodEnd } from "@/lib/format";
import {
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
  StatusBadge,
  Table,
} from "@/components/ui";

type Form = { name: string; email: string; phone: string; description: string };

export default function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [customer, setCustomer] = useState<Stripe.Customer | null>(null);
  const [subs, setSubs] = useState<Stripe.Subscription[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<Stripe.Customer>(`/v1/customers/${id}`)
      .then((c) => {
        setCustomer(c);
        setForm({
          name: c.name ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
          description: c.description ?? "",
        });
      })
      .catch((e: Error) => setError(e.message));

    // Subscriptions are a side-panel concern: a failure here shouldn't blank out
    // the customer record itself.
    stripe
      .get<StripeList<Stripe.Subscription>>("/v1/subscriptions", {
        customer: id,
        status: "all",
      })
      .then((res) => setSubs(res.data))
      .catch(() => setSubs([]));
  }, [id]);

  const set = (key: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      setCustomer(
        await stripe.post<Stripe.Customer>(`/v1/customers/${id}`, form),
      );
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setPortalBusy(true);
    setError(null);
    try {
      const { url } = await stripe.post<{ url: string }>(
        "/v1/billing_portal/sessions",
        {
          customer: id,
          return_url: `${window.location.origin}/customers/${id}`,
        },
      );
      // Leaves our origin for Stripe's, so a full-page nav — router.push can't.
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setPortalBusy(false);
    }
  }

  async function remove() {
    // Deleting a customer immediately cancels their subscriptions, so warn with
    // the actual count rather than a generic "cannot be undone".
    const live =
      subs?.filter(
        (s) => s.status !== "canceled" && s.status !== "incomplete_expired",
      ).length ?? 0;

    const warning = live
      ? `This customer has ${live} live subscription${live > 1 ? "s" : ""}. Deleting them cancels ${live > 1 ? "those" : "it"} immediately. Continue?`
      : "Delete this customer? This cannot be undone.";

    if (!confirm(warning)) return;
    setBusy(true);
    setError(null);
    try {
      await stripe.del(`/v1/customers/${id}`);
      router.push("/customers");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (error && !customer) return <ErrorBox message={error} />;
  if (!customer || !form) return <Loading />;

  return (
    <>
      <PageHeader
        title={customer.name || "(unnamed customer)"}
        description={customer.id}
        action={
          <div className="flex gap-2">
            {!editing ? (
              <Button onClick={() => setEditing(true)}>Edit</Button>
            ) : null}
            <Button variant="danger" onClick={remove} disabled={busy}>
              Delete
            </Button>
            <LinkButton href="/customers" variant="secondary">
              Back
            </LinkButton>
          </div>
        }
      />

      {error ? <ErrorBox message={error} /> : null}

      {editing ? (
        <form onSubmit={save} className="flex max-w-lg flex-col gap-4">
          <Field label="Name">
            <Input value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set("phone")} />
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
            { label: "ID", value: <Mono>{customer.id}</Mono> },
            { label: "Name", value: customer.name || "—" },
            { label: "Email", value: customer.email || "—" },
            { label: "Phone", value: customer.phone || "—" },
            { label: "Description", value: customer.description || "—" },
            { label: "Created", value: formatDate(customer.created) },
            {
              label: "Currency",
              value: customer.currency?.toUpperCase() || "—",
            },
          ]}
        />
      )}

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Subscriptions
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              What this customer is being billed for, and on what cycle.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={openPortal} disabled={portalBusy} variant="secondary">
              {portalBusy ? "Opening…" : "Manage billing"}
            </Button>
            <LinkButton
              href={`/subscriptions/new?customer=${customer.id}`}
              variant="secondary"
            >
              New subscription
            </LinkButton>
          </div>
        </div>

        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          &ldquo;Manage billing&rdquo; opens Stripe&apos;s hosted Customer Portal
          for this customer — every subscription, invoice, and payment method in
          one place, where they can cancel themselves. It&apos;s per customer,
          not per subscription.
        </p>

        {!subs ? (
          <Loading />
        ) : (
          <Table
            headers={["Amount", "Status", "Renews", "ID"]}
            isEmpty={subs.length === 0}
            empty="No subscriptions for this customer yet."
          >
            {subs.map((s) => {
              const price = s.items.data[0]?.price;
              const end = periodEnd(s);
              return (
                <Row
                  key={s.id}
                  href={`/subscriptions/${s.id}`}
                  cells={[
                    price
                      ? `${formatAmount(price.unit_amount, price.currency)}${
                          price.recurring ? ` / ${price.recurring.interval}` : ""
                        }`
                      : "—",
                    <StatusBadge key="s" status={s.status} />,
                    s.cancel_at_period_end
                      ? `ends ${end ? formatDate(end) : "—"}`
                      : end
                        ? formatDate(end)
                        : "—",
                    <Mono key="id">{s.id}</Mono>,
                  ]}
                />
              );
            })}
          </Table>
        )}
      </div>
    </>
  );
}
