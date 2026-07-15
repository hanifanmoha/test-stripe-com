"use client";

import { useEffect, useState } from "react";
import type Stripe from "stripe";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/format";
import {
  ErrorBox,
  LinkButton,
  Loading,
  Mono,
  PageHeader,
  Row,
  Table,
} from "@/components/ui";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Stripe.Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Stripe.Customer[]>("/api/customers")
      .then(setCustomers)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Who gets billed. A subscription attaches a customer to a price."
        action={<LinkButton href="/customers/new">New customer</LinkButton>}
      />

      {error ? <ErrorBox message={error} /> : null}
      {!customers && !error ? <Loading /> : null}

      {customers ? (
        <Table
          headers={["Name", "Email", "ID", "Created"]}
          isEmpty={customers.length === 0}
          empty="No customers yet. Create one to get started."
        >
          {customers.map((c) => (
            <Row
              key={c.id}
              href={`/customers/${c.id}`}
              cells={[
                c.name || "(unnamed)",
                c.email || "—",
                <Mono key="id">{c.id}</Mono>,
                formatDate(c.created),
              ]}
            />
          ))}
        </Table>
      ) : null}
    </>
  );
}
