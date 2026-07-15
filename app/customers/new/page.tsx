"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type Stripe from "stripe";
import { api } from "@/lib/client";
import {
  Button,
  ErrorBox,
  Field,
  Input,
  LinkButton,
  PageHeader,
} from "@/components/ui";

export default function NewCustomerPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    description: "",
  });

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<Stripe.Customer>("/api/customers", form);
      router.push(`/customers/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="New customer" />
      {error ? <ErrorBox message={error} /> : null}

      <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
        <Field label="Name">
          <Input value={form.name} onChange={set("name")} placeholder="Acme Inc." />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="billing@acme.com"
          />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={set("description")} />
        </Field>

        <div className="mt-2 flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create customer"}
          </Button>
          <LinkButton href="/customers" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </>
  );
}
