"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { openLegacyCheckout } from "@/lib/checkout-js";
import { cardLabel } from "@/lib/charge";
import { formatAmount, toMinorUnits } from "@/lib/format";
import { useCardModal } from "@/components/card-modal";
import {
  Button,
  ErrorBox,
  Field,
  Input,
  JsonBlock,
  Mono,
  Notice,
  PageHeader,
  Select,
} from "@/components/ui";

/**
 * Makes a card token and stops there, so it can be pasted into a curl or
 * Postman call against Stripe (or 99-stripe) by hand.
 *
 *   tok_     legacy checkout.js modal, what 99-spa / 99-spa-v2 use today
 *   ctoken_  Payment Element popup + createConfirmationToken, the replacement
 *   3DS      for a PaymentIntent that came back requires_action: Stripe.js
 *            handleNextAction with its client secret opens the bank's popup
 *
 * Both are made with a publishable key only. A token belongs to the account
 * of that key, so the secret key used afterwards must be from the same
 * account, or Stripe answers "No such token".
 */

type Kind = "tok" | "ctoken" | "3ds";
type CaptureMethod = "automatic" | "manual";

type Result = {
  kind: Kind;
  id: string;
  summary: { label: string; value: string }[];
  body: unknown;
};

const ENV_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
const KEY_PATTERN = /^pk_(test|live)_[A-Za-z0-9]{20,}$/;
const CLIENT_SECRET_PATTERN = /^(pi_[A-Za-z0-9]+)_secret_[A-Za-z0-9]+$/;
// Same as STRIPE_API_VERSION in lib/stripe.ts, which is server-only.
const API_VERSION = "2025-02-24.acacia";
const CURRENCIES = ["sgd", "usd", "idr", "myr"];

export default function TokenPage() {
  const [kind, setKind] = useState<Kind>("tok");
  const [keyOverride, setKeyOverride] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [form, setForm] = useState({
    amount: "10.00",
    currency: "sgd",
    email: "",
    name: "99.co",
    description: "Payment for package",
    captureMethod: "automatic" as CaptureMethod,
  });
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const cardModal = useCardModal();

  const publishableKey = keyOverride || ENV_KEY;
  const keyValid = KEY_PATTERN.test(publishableKey);
  const amountMinor = toMinorUnits(form.amount, form.currency) || 0;

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function createLegacyToken() {
    const token = await openLegacyCheckout(publishableKey, {
      name: form.name,
      description: form.description,
      currency: form.currency.toUpperCase(),
      email: form.email,
      amount: amountMinor,
      allowRememberMe: false,
    });
    if (!token) {
      setError("Modal closed without a card.");
      return;
    }
    setResult({
      kind: "tok",
      id: token.id,
      summary: [
        { label: "Card", value: cardLabel(token.card) },
        { label: "Card id", value: token.card.id },
        { label: "Email typed in modal", value: token.email || "—" },
        { label: "Mode", value: token.livemode ? "live" : "test" },
      ],
      body: token,
    });
  }

  async function createConfirmationToken() {
    const res = await cardModal.open({
      publishableKey,
      name: form.name,
      description: form.description,
      amount: amountMinor,
      currency: form.currency,
      captureMethod: form.captureMethod,
      returnUrl: `${window.location.origin}/token`,
    });
    if (!res) {
      setError("Modal closed without a card.");
      return;
    }
    const ctoken = res.confirmationToken;
    setResult({
      kind: "ctoken",
      id: ctoken.id,
      summary: [
        { label: "Card", value: cardLabel(ctoken.payment_method_preview?.card) },
        { label: "Expires", value: ctoken.expires_at ? new Date(ctoken.expires_at * 1000).toLocaleString() : "—" },
        { label: "Mode", value: ctoken.livemode ? "live" : "test" },
      ],
      body: ctoken,
    });
  }

  async function authenticate() {
    const stripeJs = await loadStripe(publishableKey);
    if (!stripeJs) {
      setError("Couldn't load Stripe.js.");
      return;
    }
    const { error: actionError, paymentIntent } = await stripeJs.handleNextAction({ clientSecret });
    if (actionError) setError(`${actionError.code ?? actionError.type}: ${actionError.message ?? ""}`);
    const pi = paymentIntent ?? actionError?.payment_intent;
    if (!pi) return;
    setResult({
      kind: "3ds",
      id: pi.id,
      summary: [
        { label: "Status (as Stripe.js sees it)", value: pi.status },
        { label: "Amount", value: formatAmount(pi.amount, pi.currency) },
        { label: "Capture method", value: pi.capture_method },
        ...(pi.last_payment_error
          ? [{ label: "Last error", value: `${pi.last_payment_error.code ?? pi.last_payment_error.type}: ${pi.last_payment_error.message ?? ""}` }]
          : []),
      ],
      body: pi,
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!keyValid) {
      setError("Publishable key must look like pk_test_… or pk_live_….");
      return;
    }
    if (kind === "3ds" && !CLIENT_SECRET_PATTERN.test(clientSecret)) {
      setError("Client secret must look like pi_…_secret_….");
      return;
    }
    if (kind !== "3ds" && amountMinor <= 0) {
      setError("Amount must be above zero.");
      return;
    }
    setRunning(true);
    try {
      await (kind === "tok" ? createLegacyToken() : kind === "ctoken" ? createConfirmationToken() : authenticate());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Token"
        description="Make a card token with a publishable key, then call the API with it yourself."
      />

      {error ? <ErrorBox message={error} /> : null}

      <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
        <Field label="Token type">
          <Select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setResult(null);
              setError(null);
            }}
          >
            <option value="tok">tok_ (checkout.js modal, current SPA)</option>
            <option value="ctoken">ctoken_ (Payment Element, ConfirmationToken)</option>
            <option value="3ds">3D Secure for a PaymentIntent (client secret)</option>
          </Select>
        </Field>

        <Field
          label="Publishable key"
          hint={`Optional override. Empty uses NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY${ENV_KEY ? "" : " (not set)"}. Use the account whose secret key you will call the API with.`}
        >
          <Input
            value={keyOverride}
            onChange={(e) => setKeyOverride(e.target.value.trim())}
            placeholder={ENV_KEY ? "Using the key from .env.local" : "pk_test_…"}
            spellCheck={false}
          />
        </Field>

        {kind === "3ds" ? (
          <Field
            label="Client secret"
            hint="client_secret from the PaymentIntent that came back requires_action. Same account as the publishable key."
          >
            <Input
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value.trim())}
              placeholder="pi_…_secret_…"
              spellCheck={false}
            />
          </Field>
        ) : (
          <>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Amount"
              hint={kind === "tok" ? "Display only. The token has no amount." : "Display only. Set the real amount on the PaymentIntent."}
            >
              <Input value={form.amount} onChange={set("amount")} inputMode="decimal" />
            </Field>
            <Field label="Currency" hint={kind === "ctoken" ? "Must match the PaymentIntent." : "Display only."}>
              <Select value={form.currency} onChange={set("currency")}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Popup title" hint="Display only.">
              <Input value={form.name} onChange={set("name")} />
            </Field>
            <Field label="Popup description" hint="Display only.">
              <Input value={form.description} onChange={set("description")} />
            </Field>
          </div>

          {kind === "tok" ? (
            <>
              <Field label="Email" hint="Prefills the modal. Left empty, the modal asks for it; it ends up on the token.">
                <Input type="email" value={form.email} onChange={set("email")} placeholder="agent@example.com" />
              </Field>
              <Notice>
                New accounts block this modal: enable &quot;Enable card data collection with a
                publishable key without using Stripe&apos;s pre-built UI elements&quot; at{" "}
                <Mono>dashboard.stripe.com/settings/integration</Mono>.
              </Notice>
            </>
          ) : (
            <Field label="Capture method" hint="manual = ADR option A (hold, capture later). The PaymentIntent must use the same.">
              <Select value={form.captureMethod} onChange={set("captureMethod")}>
                <option value="automatic">automatic</option>
                <option value="manual">manual</option>
              </Select>
            </Field>
          )}
          </>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={running}>
            {running
              ? "Waiting for the popup…"
              : { tok: "Open checkout.js", ctoken: "Open Payment Element", "3ds": "Open 3D Secure" }[kind]}
          </Button>
        </div>
      </form>

      {cardModal.modal}

      {result ? (
        <TokenResult
          result={result}
          amountMinor={amountMinor}
          currency={form.currency}
          captureMethod={form.captureMethod}
        />
      ) : null}

      <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
        Test cards: <Mono>4242 4242 4242 4242</Mono> no authentication,{" "}
        <Mono>4000 0027 6000 3184</Mono> 3D Secure every time,{" "}
        <Mono>4000 0000 0000 0002</Mono> declines.
      </p>
    </>
  );
}

function TokenResult({
  result,
  amountMinor,
  currency,
  captureMethod,
}: {
  result: Result;
  amountMinor: number;
  currency: string;
  captureMethod: CaptureMethod;
}) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const status = (result.body as { status?: string }).status;
  const calls: { label: string; method: "GET" | "POST"; path: string; lines: string[] }[] =
    result.kind === "tok"
      ? [{ label: "Charge it", method: "POST", path: "/v1/charges", lines: [`amount=${amountMinor}`, `currency=${currency}`, `source=${result.id}`] }]
      : result.kind === "ctoken"
        ? [
            {
              label: "Create and confirm a PaymentIntent",
              method: "POST",
              path: "/v1/payment_intents",
              lines: [
                `amount=${amountMinor}`,
                `currency=${currency}`,
                "payment_method_types[]=card",
                `confirmation_token=${result.id}`,
                "confirm=true",
                ...(captureMethod === "manual" ? ["capture_method=manual"] : []),
              ],
            },
          ]
        : [
            { label: "Check it with the secret key", method: "GET", path: `/v1/payment_intents/${result.id}`, lines: ["expand[]=latest_charge"] },
            ...(status === "requires_capture"
              ? [{ label: "Capture the hold", method: "POST" as const, path: `/v1/payment_intents/${result.id}/capture`, lines: [] }]
              : []),
          ];
  const curl = (call: (typeof calls)[number], direct: boolean) => {
    const head = direct
      ? [`curl https://api.stripe.com${call.path}`, `  -u "$STRIPE_SECRET_KEY:"`, `  -H "Stripe-Version: ${API_VERSION}"`]
      : [`curl ${origin}/api${call.path}`];
    const get = call.method === "GET" && call.lines.length ? ["  -G"] : [];
    const post = call.method === "POST" && !call.lines.length ? ["  -X POST"] : [];
    return [...head, ...get, ...post, ...call.lines.map((l) => `  -d "${l}"`)].join(" \\\n");
  };

  return (
    <div className="mt-8 flex max-w-3xl flex-col gap-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {result.kind === "3ds" ? "PaymentIntent" : "Token"}
      </h2>

      <div className="rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-4">
          <code className="break-all font-mono text-sm text-zinc-900 dark:text-zinc-100">{result.id}</code>
          <CopyButton text={result.id} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
          {result.summary.map(({ label, value }) => (
            <div key={label} className="contents">
              <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
              <dd className="col-span-2 text-zinc-900 dark:text-zinc-100">{value}</dd>
            </div>
          ))}
        </dl>
        <JsonBlock label={result.kind === "3ds" ? "Raw PaymentIntent" : "Raw token"} value={result.body} />
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {result.kind === "tok" ? (
          <>
            Single use. Charge it directly as below, or attach it with{" "}
            <Mono>POST /v1/customers/{"{id}"} source={result.id}</Mono> and charge the
            customer, which is what 99-stripe does today.
          </>
        ) : result.kind === "3ds" ? (
          <>
            The status above is what the browser saw. Decide from the secret-key read
            below: <Mono>succeeded</Mono> is paid, <Mono>requires_capture</Mono> is a
            hold (option A), <Mono>requires_payment_method</Mono> means authentication
            failed or the card was declined.
          </>
        ) : (
          <>
            Single use, expires in 12 hours. A 3D Secure card comes back{" "}
            <Mono>requires_action</Mono>, which only the browser can finish; use{" "}
            <Mono>4242…</Mono> for a call that completes from curl.
          </>
        )}
      </p>

      {calls.map((call) => (
        <div key={call.path} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {call.label}: <Mono>{call.method} {call.path}</Mono>
          </h3>
          <CodeBlock label="Stripe directly" text={curl(call, true)} />
          <CodeBlock label="Through this app's proxy (adds the secret key and version)" text={curl(call, false)} />
        </div>
      ))}
    </div>
  );
}

function CodeBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
        <CopyButton text={text} />
      </div>
      <pre className="overflow-auto border-t border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        {text}
      </pre>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}
