"use client";

import { use, useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe } from "@/lib/client";
import { formatDate } from "@/lib/format";
import { formatRate, inclusivity, region } from "@/lib/tax";
import {
  Badge,
  DetailList,
  ErrorBox,
  LinkButton,
  Loading,
  Mono,
  PageHeader,
} from "@/components/ui";

export default function TaxRatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [rate, setRate] = useState<Stripe.TaxRate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<Stripe.TaxRate>(`/v1/tax_rates/${id}`)
      .then(setRate)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error && !rate) return <ErrorBox message={error} />;
  if (!rate) return <Loading />;

  return (
    <>
      <PageHeader
        title={rate.display_name}
        description={rate.id}
        action={
          <LinkButton href="/tax-rates" variant="secondary">
            Back
          </LinkButton>
        }
      />

      <DetailList
        items={[
          { label: "ID", value: <Mono>{rate.id}</Mono> },
          { label: "Display name", value: rate.display_name },
          { label: "Description", value: rate.description || "—" },
          { label: "Rate", value: formatRate(rate) },
          {
            label: "Inclusive",
            value: rate.inclusive
              ? "Yes — baked into the price"
              : "No — added on top",
          },
          { label: "Type", value: inclusivity(rate) },
          { label: "Tax type", value: rate.tax_type || "—" },
          { label: "Region", value: region(rate) },
          { label: "Country", value: rate.country || "—" },
          { label: "State", value: rate.state || "—" },
          { label: "Jurisdiction", value: rate.jurisdiction || "—" },
          { label: "Status", value: <Badge active={rate.active} /> },
          { label: "Created", value: formatDate(rate.created) },
        ]}
      />
    </>
  );
}
