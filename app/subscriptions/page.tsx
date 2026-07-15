"use client";

import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { api } from "@/lib/client";
import { formatAmount, formatDate, periodEnd } from "@/lib/format";
import {
  ErrorBox,
  LinkButton,
  Loading,
  Mono,
  Notice,
  PageHeader,
  Row,
  StatusBadge,
  Table,
} from "@/components/ui";

function customerLabel(customer: Stripe.Subscription["customer"]): string {
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return "(deleted customer)";
  return (customer as Stripe.Customer).name || (customer as Stripe.Customer).email || customer.id;
}

export default function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = use(searchParams);
  const [subs, setSubs] = useState<Stripe.Subscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Stripe.Subscription[]>("/api/subscriptions")
      .then(setSubs)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="A customer bound to a recurring price, billed automatically."
        action={<LinkButton href="/subscriptions/new">New subscription</LinkButton>}
      />

      {checkout === "success" ? (
        <Notice>
          Checkout completed. Stripe redirected you back here — but the
          subscription is created by Stripe&apos;s servers, not by this redirect.
          If it isn&apos;t listed yet, give it a second and refresh.
        </Notice>
      ) : null}
      {checkout === "cancelled" ? (
        <Notice>
          Checkout was abandoned, so no subscription exists. Nothing was charged.
        </Notice>
      ) : null}

      {error ? <ErrorBox message={error} /> : null}
      {!subs && !error ? <Loading /> : null}

      {subs ? (
        <Table
          headers={["Customer", "Amount", "Status", "Renews", "ID"]}
          isEmpty={subs.length === 0}
          empty="No subscriptions yet. Create one to run the Checkout flow."
        >
          {subs.map((s) => {
            const price = s.items.data[0]?.price;
            const end = periodEnd(s);
            return (
              <Row
                key={s.id}
                href={`/subscriptions/${s.id}`}
                cells={[
                  customerLabel(s.customer),
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
      ) : null}
    </>
  );
}
