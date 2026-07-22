"use client";

import { useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type StripeList } from "@/lib/client";
import { formatRate, inclusivity, region } from "@/lib/tax";
import {
  Badge,
  ErrorBox,
  Loading,
  Mono,
  Notice,
  PageHeader,
  Row,
  Table,
} from "@/components/ui";

export default function TaxRatesPage() {
  const [rates, setRates] = useState<Stripe.TaxRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<StripeList<Stripe.TaxRate>>("/v1/tax_rates", { limit: 100 })
      .then((res) => setRates(res.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Tax rates"
        description="Reusable rates you can apply to invoices, subscriptions, and checkout."
      />

      {error ? <ErrorBox message={error} /> : null}
      {!rates && !error ? <Loading /> : null}

      {rates ? (
        <Table
          headers={["Name", "Rate", "Type", "Region", "Status", "ID"]}
          isEmpty={rates.length === 0}
          empty="No tax rates. This playground only lists them — create tax rates in the Stripe Dashboard (Product catalog → Tax rates)."
        >
          {rates.map((r) => (
            <Row
              key={r.id}
              href={`/tax-rates/${r.id}`}
              cells={[
                r.display_name,
                formatRate(r),
                inclusivity(r),
                region(r),
                <Badge key="s" active={r.active} />,
                <Mono key="id">{r.id}</Mono>,
              ]}
            />
          ))}
        </Table>
      ) : null}

      {rates && rates.length > 0 ? (
        <Notice>
          <strong>Read-only.</strong> Tax rates are shown here but not editable —
          they&apos;re immutable in Stripe except for <Mono>active</Mono>,{" "}
          <Mono>display_name</Mono>, and <Mono>description</Mono>, and like prices
          they can never be deleted (archive with <Mono>active: false</Mono>).
        </Notice>
      ) : null}
    </>
  );
}
