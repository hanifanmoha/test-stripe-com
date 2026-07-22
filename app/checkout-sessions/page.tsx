"use client";

import { useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type StripeList } from "@/lib/client";
import { formatAmount } from "@/lib/format";
import {
  ErrorBox,
  Loading,
  Mono,
  Notice,
  PageHeader,
  Table,
} from "@/components/ui";

function customerLabel(session: Stripe.Checkout.Session): string {
  const c = session.customer;
  if (c && typeof c === "object" && !("deleted" in c && c.deleted)) {
    const cust = c as Stripe.Customer;
    return cust.name || cust.email || cust.id;
  }
  if (typeof c === "string") return c;
  return session.customer_details?.email || "—";
}

/** Sessions expire within 24h, so show the time, not just the date. */
function whenExpires(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CheckoutSessionsPage() {
  const [sessions, setSessions] = useState<Stripe.Checkout.Session[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<StripeList<Stripe.Checkout.Session>>("/v1/checkout/sessions", {
        limit: 100,
        // "Active" = still payable: not completed, not expired.
        status: "open",
        expand: ["data.customer"],
      })
      .then((res) => setSessions(res.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Active checkout sessions"
        description="Open sessions — a customer started checkout but hasn't paid yet."
      />

      {error ? <ErrorBox message={error} /> : null}
      {!sessions && !error ? <Loading /> : null}

      {sessions ? (
        <>
          <Table
            headers={["Amount", "Customer", "Mode", "Expires", "ID", ""]}
            isEmpty={sessions.length === 0}
            empty="No active checkout sessions. They appear here when checkout starts and disappear once paid or expired (Stripe expires them after 24h)."
          >
            {sessions.map((s) => (
              <tr
                key={s.id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {formatAmount(s.amount_total, s.currency)}
                </td>
                <td className="px-4 py-3">{customerLabel(s)}</td>
                <td className="px-4 py-3">{s.mode}</td>
                <td className="px-4 py-3">
                  {s.expires_at ? whenExpires(s.expires_at) : "—"}
                </td>
                <td className="px-4 py-3">
                  <Mono>{s.id}</Mono>
                </td>
                <td className="px-4 py-3">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
                    >
                      Open ↗
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>

          {sessions.length > 0 ? (
            <Notice>
              <strong>An open session isn&apos;t a subscription.</strong> Nothing
              has been billed — the subscription only exists once payment
              completes. &ldquo;Open&rdquo; goes to the live Stripe checkout page
              (present only while a session is active).
            </Notice>
          ) : null}
        </>
      ) : null}
    </>
  );
}
