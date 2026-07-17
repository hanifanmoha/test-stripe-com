# Stripe CRM (playground)

A deliberately minimal CRM for exploring how **Stripe subscriptions** are assembled. Next.js provides the frontend and the backend; Stripe provides the data. There is **no database** — Stripe is the datastore.

The browser never talks to Stripe directly. It calls this app's `/api/v1/*` endpoints, which are a single **transparent proxy** ([`app/api/[...path]/route.ts`](app/api/[...path]/route.ts)): it attaches the secret key and forwards the request to `https://api.stripe.com/v1/*` unchanged, returning Stripe's raw response. That keeps `STRIPE_SECRET_KEY` server-side while making every call 1:1 with Stripe's own API — so what you see in the Network tab is exactly what you'd send Stripe with curl. The paths mirror Stripe (`/api/v1/customers` → `/v1/customers`), and the browser speaks Stripe's native form-encoded format ([`lib/client.ts`](lib/client.ts)).

## Setup

```bash
cp .env.local.example .env.local   # then add your sk_test_... key
npm run dev                        # http://localhost:3000
```

Get a test key from the [Stripe dashboard](https://dashboard.stripe.com/test/apikeys). **Use a test key** — the app issues real creates, updates, and deletes against whatever account the key belongs to.

## The model

| Object | Is | CRUD support |
| --- | --- | --- |
| **Customer** | who gets billed | full — create, read, update, delete |
| **Product** | what you sell (no amount) | delete only while no price references it; otherwise archive |
| **Price** | how much + how often | **no delete, and amounts are immutable** |
| **Subscription** | a customer bound to a recurring price | created via Checkout; cancel, never delete |

Building blocks in dependency order: a price needs a product, and a subscription needs a customer plus a recurring price.

### Why prices can't be edited

A price's `unit_amount`, `currency`, and `recurring` interval are frozen at creation. Subscriptions bill against a price ID, so letting you rewrite an amount would silently re-bill everyone already subscribed to it. Only `nickname`, `active`, and metadata are mutable.

To change what something costs, you **archive the old price and create a new one**. Archiving hides a price from new checkouts while existing subscriptions keep billing on it. This is the single most important thing to internalise before adding subscriptions.

## Subscribing (Stripe-hosted Checkout)

> Stripe offers several ways to take payment. [CHECKOUT.md](CHECKOUT.md) compares them and explains why this project uses the hosted one.

**Subscriptions → New subscription** → pick a customer and a recurring price → you're sent to Stripe's own checkout page. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC. Stripe then redirects you back.

Other [test cards](https://docs.stripe.com/testing?testing-method=card-numbers#cards) are worth a look once the happy path works — there are numbers that decline, that force a 3D Secure challenge, and that succeed initially but fail on renewal. That last group is the only way to see `past_due` and `unpaid` without waiting for a real failure.

Two things worth internalising:

- **No Stripe SDK runs in the browser.** This app only ever creates the session server-side and redirects. Card details are typed on Stripe's domain, so they never touch this server — that's what keeps it out of PCI scope.
- **The redirect back isn't what creates the subscription.** Stripe's servers create it on payment success; the `success_url` is just where the user lands, and they might close the tab instead. In a real app, anything that must happen on payment (provisioning, emails) belongs in a **webhook** — not the return handler. This app has no webhook yet, which is why the list may need a refresh.

### Cancelling

Two paths that behave very differently, both exposed on the detail page:

- **Cancel at period end** — reversible. Stays `active` and keeps billing until the period ends.
- **Cancel now** — immediate and permanent.

Neither deletes anything: the subscription persists with status `canceled`.

## Customer Portal

The **Manage billing** button on a customer's detail page opens Stripe's hosted Customer Portal, where the customer can see their subscriptions and invoices, update payment methods, and cancel — none of which you have to build.

It's **per customer, not per subscription**: one session exposes everything that customer has. (You can deep-link into a single subscription's cancel screen via `flow_data`, but no button uses it yet.)

Same architecture as Checkout: the session is created server-side and the browser is redirected. No Stripe SDK in the browser.

> **No auth here.** This app takes the customer id from the request body, which is fine locally but would let anyone open anyone else's billing portal in production. Real apps derive the customer from the logged-in session.

## Scripts

```bash
npm run dev      # dev server (Turbopack, default in Next 16)
npm run build    # production build
npm run lint     # eslint — note: `next build` does NOT run lint
npx tsc --noEmit # typecheck
```

## Next steps

- **Webhooks** — the missing piece for reliably reacting to payment events (`checkout.session.completed`, `invoice.payment_failed`) rather than trusting the browser to come back.
- **Embedded checkout** — if you ever want the card form inside your own UI, that's the path that needs `@stripe/stripe-js` and a *publishable* key. The secret key still stays server-side.

Agent-facing notes on architecture and Next.js 16 pitfalls live in [AGENTS.md](AGENTS.md).
