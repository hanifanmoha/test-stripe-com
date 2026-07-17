"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type Stripe from "stripe";
import { stripe } from "@/lib/client";
import {
  Button,
  ErrorBox,
  Field,
  Input,
  LinkButton,
  PageHeader,
} from "@/components/ui";

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await stripe.post<Stripe.Product>("/v1/products", form);
      router.push(`/products/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New product"
        description="Just a name and description — you'll attach prices afterwards."
      />
      {error ? <ErrorBox message={error} /> : null}

      <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={set("name")}
            placeholder="Pro plan"
            required
          />
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={set("description")} />
        </Field>

        <div className="mt-2 flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create product"}
          </Button>
          <LinkButton href="/products" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </>
  );
}
