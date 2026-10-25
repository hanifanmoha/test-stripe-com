"use client";

import { useEffect, useState } from "react";
import { stripe, type StripeList } from "@/lib/client";
import { formatAmount, formatDate } from "@/lib/format";
import { cardLabel, chargeCard, chargeCustomerLabel, type Charge } from "@/lib/charge";
import {
  ChargeStatusBadge,
  ErrorBox,
  LinkButton,
  Loading,
  Mono,
  PageHeader,
  Row,
  Table,
} from "@/components/ui";

export default function ChargesPage() {
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<StripeList<Charge>>("/v1/charges", {
        limit: 100,
        expand: ["data.customer"],
      })
      .then((res) => setCharges(res.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Charges"
        description="Every card payment — one-off charges and the charges behind subscription invoices."
        action={<LinkButton href="/charges/new">New charge</LinkButton>}
      />

      {error ? <ErrorBox message={error} /> : null}
      {!charges && !error ? <Loading /> : null}

      {charges ? (
        <Table
          headers={["Amount", "Customer", "Status", "Card", "Description", "Date", "ID"]}
          isEmpty={charges.length === 0}
          empty="No charges yet. Run a charge flow to create one."
        >
          {charges.map((c) => (
            <Row
              key={c.id}
              href={`/charges/${c.id}`}
              cells={[
                formatAmount(c.amount, c.currency),
                chargeCustomerLabel(c),
                <ChargeStatusBadge key="s" status={c.status} />,
                cardLabel(chargeCard(c)),
                c.description ?? "—",
                formatDate(c.created),
                <Mono key="id">{c.id}</Mono>,
              ]}
            />
          ))}
        </Table>
      ) : null}
    </>
  );
}
