"use client";

import { useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type StripeList } from "@/lib/client";
import { formatAmount } from "@/lib/format";
import {
  Badge,
  ErrorBox,
  LinkButton,
  Loading,
  Mono,
  PageHeader,
  Row,
  Table,
} from "@/components/ui";

export default function PricesPage() {
  const [prices, setPrices] = useState<Stripe.Price[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<StripeList<Stripe.Price>>("/v1/prices", {
        limit: 100,
        expand: ["data.product"],
      })
      .then((res) => setPrices(res.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Prices"
        description="How much and how often. Amounts are immutable once created."
        action={<LinkButton href="/prices/new">New price</LinkButton>}
      />

      {error ? <ErrorBox message={error} /> : null}
      {!prices && !error ? <Loading /> : null}

      {prices ? (
        <Table
          headers={["Amount", "Product", "Billing", "Status", "ID"]}
          isEmpty={prices.length === 0}
          empty="No prices yet. Create a product first, then price it."
        >
          {prices.map((p) => (
            <Row
              key={p.id}
              href={`/prices/${p.id}`}
              cells={[
                formatAmount(p.unit_amount, p.currency),
                typeof p.product === "object" && "name" in p.product
                  ? p.product.name
                  : String(p.product),
                p.recurring ? `every ${p.recurring.interval}` : "one-time",
                <Badge key="s" active={p.active} />,
                <Mono key="id">{p.id}</Mono>,
              ]}
            />
          ))}
        </Table>
      ) : null}
    </>
  );
}
