"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe } from "@/lib/client";
import { formatAmount, formatDate } from "@/lib/format";
import {
  billingReasonLabel,
  invoiceCustomerLabel,
  invoiceSubscriptionId,
} from "@/lib/invoice";
import {
  DetailList,
  ErrorBox,
  InvoiceStatusBadge,
  LinkButton,
  Loading,
  Mono,
  PageHeader,
} from "@/components/ui";

const underline =
  "underline hover:text-zinc-600 dark:hover:text-zinc-300";

export default function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [inv, setInv] = useState<Stripe.Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<Stripe.Invoice>(`/v1/invoices/${id}`)
      .then(setInv)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error && !inv) return <ErrorBox message={error} />;
  if (!inv) return <Loading />;

  const subscriptionId = invoiceSubscriptionId(inv);
  const customerId =
    typeof inv.customer === "string" ? inv.customer : inv.customer?.id;

  return (
    <>
      <PageHeader
        title={inv.number ?? inv.id}
        description={inv.id}
        action={
          <LinkButton href="/invoices" variant="secondary">
            Back
          </LinkButton>
        }
      />

      <DetailList
        items={[
          { label: "Number", value: <Mono>{inv.number ?? "—"}</Mono> },
          { label: "Status", value: <InvoiceStatusBadge status={inv.status} /> },
          { label: "Reason", value: billingReasonLabel(inv.billing_reason) },
          {
            label: "Customer",
            value: customerId ? (
              <Link href={`/customers/${customerId}`} className={underline}>
                {invoiceCustomerLabel(inv)}
              </Link>
            ) : (
              invoiceCustomerLabel(inv)
            ),
          },
          {
            label: "Subscription",
            value: subscriptionId ? (
              <Link href={`/subscriptions/${subscriptionId}`} className={underline}>
                {subscriptionId}
              </Link>
            ) : (
              "— (not from a subscription)"
            ),
          },
          { label: "Total", value: formatAmount(inv.total, inv.currency) },
          {
            label: "Amount paid",
            value: formatAmount(inv.amount_paid, inv.currency),
          },
          {
            label: "Amount due",
            value: formatAmount(inv.amount_due, inv.currency),
          },
          { label: "Created", value: formatDate(inv.created) },
          {
            label: "Document",
            value: (
              <div className="flex gap-3">
                {inv.hosted_invoice_url ? (
                  <a
                    href={inv.hosted_invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
                  >
                    View invoice ↗
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
            ),
          },
        ]}
      />

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Read-only. Invoices are generated and managed by Stripe — this playground
        lists them but doesn&apos;t create, edit, or delete.
      </p>
    </>
  );
}
