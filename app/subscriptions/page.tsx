"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type StripeList } from "@/lib/client";
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

/**
 * Shows what the checkout actually resulted in, by asking Stripe about the
 * session id it handed back — rather than assuming success because the URL says
 * so. `payment_status` is the authoritative answer.
 */
function CheckoutReceipt({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Stripe.Checkout.Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<Stripe.Checkout.Session>(`/v1/checkout/sessions/${sessionId}`, {
        expand: ["subscription", "customer"],
      })
      .then(setSession)
      .catch((e: Error) => setError(e.message));
  }, [sessionId]);

  if (error) {
    return <ErrorBox message={`Couldn't load payment details: ${error}`} />;
  }

  if (!session) {
    return (
      <div className="mb-6 rounded-lg border border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Confirming payment with Stripe…
      </div>
    );
  }

  const paid = session.payment_status === "paid";
  const sub =
    session.subscription && typeof session.subscription === "object"
      ? session.subscription
      : null;
  const end = sub ? periodEnd(sub) : null;

  // Reaching this page doesn't mean money moved — say so plainly if it didn't.
  if (!paid) {
    return (
      <Notice>
        <strong>Payment not completed.</strong> Stripe reports this session as{" "}
        <Mono>{session.payment_status}</Mono>
        {session.status ? (
          <>
            {" "}
            (status <Mono>{session.status}</Mono>)
          </>
        ) : null}
        . No subscription was created.
      </Notice>
    );
  }

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-green-300 dark:border-green-900">
      <div className="border-b border-green-300 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950">
        <div className="text-sm font-semibold text-green-900 dark:text-green-200">
          Payment successful
        </div>
        <div className="mt-0.5 text-xs text-green-800 dark:text-green-300">
          Confirmed with Stripe just now — not assumed from the redirect.
        </div>
      </div>

      <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {[
          {
            label: "Amount paid",
            value: formatAmount(session.amount_total, session.currency),
          },
          {
            label: "Payment status",
            value: <Mono>{session.payment_status}</Mono>,
          },
          {
            label: "Billed to",
            value:
              session.customer_details?.email ||
              (session.customer && typeof session.customer === "object"
                ? customerLabel(session.customer as Stripe.Customer)
                : "—"),
          },
          ...(sub
            ? [
                {
                  label: "Subscription",
                  value: (
                    <Link
                      href={`/subscriptions/${sub.id}`}
                      className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      {sub.id}
                    </Link>
                  ),
                },
                {
                  label: "Status",
                  value: <StatusBadge status={sub.status} />,
                },
                {
                  label: "Next renewal",
                  value: end ? formatDate(end) : "—",
                },
              ]
            : []),
          { label: "Session", value: <Mono>{session.id}</Mono> },
        ].map(({ label, value }) => (
          <div key={label} className="grid grid-cols-3 gap-4 px-4 py-2.5">
            <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
            <dd className="col-span-2 text-sm text-zinc-900 dark:text-zinc-100">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  // Stripe substitutes the real id into the {CHECKOUT_SESSION_ID} placeholder in
  // success_url, so it arrives here on the way back.
  const { checkout, session_id: sessionId } = use(searchParams);
  const [subs, setSubs] = useState<Stripe.Subscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<StripeList<Stripe.Subscription>>("/v1/subscriptions", {
        limit: 100,
        status: "all",
        expand: ["data.customer"],
      })
      .then((res) => setSubs(res.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="A customer bound to a recurring price, billed automatically."
        action={<LinkButton href="/subscriptions/new">New subscription</LinkButton>}
      />

      {/* With a session id we can ask Stripe what really happened; without one
          we can only report that the browser came back. */}
      {checkout === "success" && sessionId ? (
        <CheckoutReceipt sessionId={sessionId} />
      ) : null}
      {checkout === "success" && !sessionId ? (
        <Notice>
          Checkout completed, but no session id came back, so the payment
          couldn&apos;t be confirmed. If the subscription isn&apos;t listed,
          refresh in a moment.
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
