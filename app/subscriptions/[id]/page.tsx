"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type StripeList } from "@/lib/client";
import { formatAmount, formatDate, periodEnd } from "@/lib/format";
import { billingReasonLabel } from "@/lib/invoice";
import {
  Button,
  DetailList,
  ErrorBox,
  InvoiceStatusBadge,
  LinkButton,
  Loading,
  Mono,
  Notice,
  PageHeader,
  StatusBadge,
  Table,
} from "@/components/ui";

export default function SubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [sub, setSub] = useState<Stripe.Subscription | null>(null);
  const [invoices, setInvoices] = useState<Stripe.Invoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<Stripe.Subscription>(`/v1/subscriptions/${id}`, {
        expand: ["customer", "items.data.price.product"],
      })
      .then(setSub)
      .catch((e: Error) => setError(e.message));

    // One invoice per billing cycle (plus the initial one). A failure here is a
    // side concern — it shouldn't blank the subscription record.
    stripe
      .get<StripeList<Stripe.Invoice>>("/v1/invoices", {
        subscription: id,
        limit: 100,
      })
      .then((res) => setInvoices(res.data))
      .catch(() => setInvoices([]));
  }, [id]);

  async function togglePeriodEndCancel() {
    if (!sub) return;
    setBusy(true);
    setError(null);
    try {
      setSub(
        await stripe.post<Stripe.Subscription>(`/v1/subscriptions/${id}`, {
          cancel_at_period_end: !sub.cancel_at_period_end,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelNow() {
    if (
      !confirm(
        "Cancel immediately? Billing stops now and this cannot be undone — the subscription can't be reactivated.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      // Stripe cancels a subscription via DELETE /v1/subscriptions/{id} — the
      // object survives with status "canceled", it isn't destroyed.
      setSub(await stripe.del<Stripe.Subscription>(`/v1/subscriptions/${id}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !sub) return <ErrorBox message={error} />;
  if (!sub) return <Loading />;

  const item = sub.items.data[0];
  const price = item?.price;
  const end = periodEnd(sub);
  const done = sub.status === "canceled" || sub.status === "incomplete_expired";

  const customer = sub.customer;
  const customerId = typeof customer === "string" ? customer : customer.id;
  const customerName =
    typeof customer === "string"
      ? customer
      : "deleted" in customer && customer.deleted
        ? "(deleted customer)"
        : (customer as Stripe.Customer).name ||
          (customer as Stripe.Customer).email ||
          customer.id;

  const productName =
    price && typeof price.product === "object" && "name" in price.product
      ? price.product.name
      : undefined;

  return (
    <>
      <PageHeader
        title={customerName}
        description={sub.id}
        action={
          <div className="flex gap-2">
            {!done ? (
              <>
                <Button
                  variant="secondary"
                  onClick={togglePeriodEndCancel}
                  disabled={busy}
                >
                  {sub.cancel_at_period_end
                    ? "Resume renewal"
                    : "Cancel at period end"}
                </Button>
                <Button variant="danger" onClick={cancelNow} disabled={busy}>
                  Cancel now
                </Button>
              </>
            ) : null}
            <LinkButton href="/subscriptions" variant="secondary">
              Back
            </LinkButton>
          </div>
        }
      />

      {error ? <ErrorBox message={error} /> : null}

      {sub.status === "incomplete" ? (
        <Notice>
          <strong>Checkout never completed payment.</strong> An{" "}
          <Mono>incomplete</Mono> subscription isn&apos;t billing anything — it
          expires on its own if the first payment is never made.
        </Notice>
      ) : null}

      {sub.cancel_at_period_end && !done ? (
        <Notice>
          <strong>Scheduled to cancel.</strong> Still <Mono>active</Mono> and
          billing until {end ? formatDate(end) : "the period ends"}, then it
          stops. Reversible until then — that&apos;s the difference from
          &ldquo;Cancel now&rdquo;.
        </Notice>
      ) : null}

      <DetailList
        items={[
          { label: "ID", value: <Mono>{sub.id}</Mono> },
          { label: "Status", value: <StatusBadge status={sub.status} /> },
          {
            label: "Customer",
            value: (
              <Link
                href={`/customers/${customerId}`}
                className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                {customerName}
              </Link>
            ),
          },
          {
            label: "Price",
            value: price ? (
              <Link
                href={`/prices/${price.id}`}
                className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                {formatAmount(price.unit_amount, price.currency)}
                {price.recurring ? ` / ${price.recurring.interval}` : ""}
                {productName ? ` — ${productName}` : ""}
              </Link>
            ) : (
              "—"
            ),
          },
          {
            label: "Current period ends",
            value: end ? formatDate(end) : "—",
          },
          {
            label: "Renews automatically",
            value: done ? "—" : sub.cancel_at_period_end ? "No — cancels" : "Yes",
          },
          { label: "Created", value: formatDate(sub.created) },
          {
            label: "Canceled at",
            value: sub.canceled_at ? formatDate(sub.canceled_at) : "—",
          },
        ]}
      />

      <div className="mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Invoices
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            One per billing cycle — Stripe generates a new invoice each period,
            plus the first at checkout.
          </p>
        </div>

        {!invoices ? (
          <Loading />
        ) : (
          <Table
            headers={["Number", "Reason", "Amount", "Status", "Date", "Document"]}
            isEmpty={invoices.length === 0}
            empty="No invoices yet."
          >
            {invoices.map((inv) => (
              <tr
                key={inv.id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <td className="px-4 py-3">
                  <Mono>{inv.number ?? inv.id}</Mono>
                </td>
                <td className="px-4 py-3">
                  {billingReasonLabel(inv.billing_reason)}
                </td>
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {formatAmount(inv.total, inv.currency)}
                </td>
                <td className="px-4 py-3">
                  <InvoiceStatusBadge status={inv.status} />
                </td>
                <td className="px-4 py-3">{formatDate(inv.created)}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    {inv.hosted_invoice_url ? (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
                      >
                        View ↗
                      </a>
                    ) : null}
                    {inv.invoice_pdf ? (
                      <a
                        href={inv.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        PDF
                      </a>
                    ) : null}
                    {!inv.hosted_invoice_url && !inv.invoice_pdf ? "—" : null}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Canceling never deletes the subscription — Stripe keeps it as a record
        with status <Mono>canceled</Mono>, which is why there&apos;s no delete
        button here.
      </p>
    </>
  );
}
