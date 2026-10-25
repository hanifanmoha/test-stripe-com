"use client";

import Link from "next/link";
import { use } from "react";
import { LinkButton, PageHeader } from "@/components/ui";
import { CONFIRMATION_TOKEN_FLOW, ConfirmationTokenFlow } from "./confirmation-token-flow";
import { LegacyTokenFlow } from "./legacy-token-flow";
import type { FlowProps } from "./shared";

// One tab per way of charging a card. Add new flows here.
const FLOWS: {
  id: string;
  label: string;
  description: string;
  Component: (props: FlowProps) => React.ReactNode;
}[] = [
  {
    id: "spa-token",
    label: "SPA token flow (current)",
    description:
      "checkout.js token → saved as the customer's default card → Charges API. What 99-spa and 99-spa-v2 do today.",
    Component: LegacyTokenFlow,
  },
  {
    id: CONFIRMATION_TOKEN_FLOW,
    label: "Payment Element + ConfirmationToken",
    description:
      "Payment Element → ConfirmationToken → the backend creates and confirms a PaymentIntent. 3D Secure runs in the browser only when the bank asks for it.",
    Component: ConfirmationTokenFlow,
  },
];

export default function NewChargePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = use(searchParams);
  const active = FLOWS.find((f) => f.id === params.flow) ?? FLOWS[0];
  const Flow = active.Component;

  return (
    <>
      <PageHeader
        title="New charge"
        description="A one-off card payment, run step by step."
        action={
          <LinkButton href="/charges" variant="secondary">
            Back
          </LinkButton>
        }
      />

      <div className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {FLOWS.map((f) => (
          <Link
            key={f.id}
            href={`/charges/new?flow=${f.id}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              f.id === active.id
                ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">{active.description}</p>

      <Flow key={active.id} searchParams={params} />
    </>
  );
}
