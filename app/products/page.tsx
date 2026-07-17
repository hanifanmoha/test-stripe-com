"use client";

import { useEffect, useState } from "react";
import type Stripe from "stripe";
import { stripe, type StripeList } from "@/lib/client";
import { formatDate } from "@/lib/format";
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

export default function ProductsPage() {
  const [products, setProducts] = useState<Stripe.Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripe
      .get<StripeList<Stripe.Product>>("/v1/products", { limit: 100 })
      .then((res) => setProducts(res.data))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Products"
        description="What you sell. A product holds no amount — that lives on its prices."
        action={<LinkButton href="/products/new">New product</LinkButton>}
      />

      {error ? <ErrorBox message={error} /> : null}
      {!products && !error ? <Loading /> : null}

      {products ? (
        <Table
          headers={["Name", "Status", "ID", "Created"]}
          isEmpty={products.length === 0}
          empty="No products yet. Create one, then give it a price."
        >
          {products.map((p) => (
            <Row
              key={p.id}
              href={`/products/${p.id}`}
              cells={[
                p.name,
                <Badge key="s" active={p.active} />,
                <Mono key="id">{p.id}</Mono>,
                formatDate(p.created),
              ]}
            />
          ))}
        </Table>
      ) : null}
    </>
  );
}
