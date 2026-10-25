"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { stripe } from "@/lib/client";
import { formatAmount, formatDate } from "@/lib/format";
import {
  cardLabel,
  chargeCustomerId,
  chargeCustomerLabel,
  type Charge,
} from "@/lib/charge";
import {
  ChargeStatusBadge,
  DetailList,
  ErrorBox,
  JsonBlock,
  LinkButton,
  Loading,
  Mono,
  PageHeader,
} from "@/components/ui";

const underline = "underline hover:text-zinc-600 dark:hover:text-zinc-300";

export default function ChargePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [charge, setCharge] = useState<Charge | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<Charge>(`/v1/charges/${id}`, { expand: ["customer"] })
      .then(setCharge)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error && !charge) return <ErrorBox message={error} />;
  if (!charge) return <Loading />;

  const customerId = chargeCustomerId(charge);
  const metadata = Object.entries(charge.metadata ?? {});

  return (
    <>
      <PageHeader
        title={formatAmount(charge.amount, charge.currency)}
        description={charge.id}
        action={
          <LinkButton href="/charges" variant="secondary">
            Back
          </LinkButton>
        }
      />

      <DetailList
        items={[
          { label: "Status", value: <ChargeStatusBadge status={charge.status} /> },
          {
            label: "Customer",
            value: customerId ? (
              <Link href={`/customers/${customerId}`} className={underline}>
                {chargeCustomerLabel(charge)}
              </Link>
            ) : (
              "—"
            ),
          },
          { label: "Description", value: charge.description ?? "—" },
          {
            label: "Card (charge.source)",
            value: charge.source ? cardLabel(charge.source) : "— (not returned)",
          },
          {
            label: "Card (payment_method_details.card)",
            value: cardLabel(charge.payment_method_details?.card),
          },
          {
            label: "Statement descriptor sent",
            value: <Mono>{charge.statement_descriptor ?? "—"}</Mono>,
          },
          {
            label: "Shown on card statement",
            value: <Mono>{charge.calculated_statement_descriptor ?? "—"}</Mono>,
          },
          { label: "Receipt number", value: charge.receipt_number ?? "— (test mode sends none)" },
          {
            label: "Failure",
            value: charge.failure_code
              ? `${charge.failure_code}: ${charge.failure_message}`
              : "—",
          },
          {
            label: "Refunded",
            value: charge.amount_refunded
              ? formatAmount(charge.amount_refunded, charge.currency)
              : "—",
          },
          { label: "PaymentIntent", value: charge.payment_intent ? <Mono>{charge.payment_intent}</Mono> : "— (Charges API, no PaymentIntent)" },
          { label: "Created", value: formatDate(charge.created) },
          {
            label: "Metadata",
            value: metadata.length ? (
              <div className="flex flex-col gap-1">
                {metadata.map(([key, value]) => (
                  <div key={key}>
                    <Mono>{key}</Mono> {value}
                  </div>
                ))}
              </div>
            ) : (
              "—"
            ),
          },
        ]}
      />

      <JsonBlock label="Raw charge" value={charge} />
    </>
  );
}
