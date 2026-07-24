"use client";

import { useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type StripeList } from "@/lib/client";
import { formatAmount, formatDate } from "@/lib/format";
import { billingReasonLabel, invoiceCustomerLabel } from "@/lib/invoice";
import {
  ErrorBox,
  InvoiceStatusBadge,
  Loading,
  PageHeader,
  Row,
  Table,
} from "@/components/ui";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Stripe.Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<StripeList<Stripe.Invoice>>("/v1/invoices", { limit: 100 })
      .then((res) => setInvoices(res.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every invoice Stripe has generated — one per billing cycle, plus the first at checkout."
      />

      {error ? <ErrorBox message={error} /> : null}
      {!invoices && !error ? <Loading /> : null}

      {invoices ? (
        <Table
          headers={["Number", "Customer", "Reason", "Amount", "Status", "Date"]}
          isEmpty={invoices.length === 0}
          empty="No invoices yet. They appear once a subscription bills."
        >
          {invoices.map((inv) => (
            <Row
              key={inv.id}
              href={`/invoices/${inv.id}`}
              cells={[
                inv.number ?? inv.id,
                invoiceCustomerLabel(inv),
                billingReasonLabel(inv.billing_reason),
                formatAmount(inv.total, inv.currency),
                <InvoiceStatusBadge key="s" status={inv.status} />,
                formatDate(inv.created),
              ]}
            />
          ))}
        </Table>
      ) : null}
    </>
  );
}
