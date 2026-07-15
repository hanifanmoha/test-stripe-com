<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project guidance

Guidance for AI coding agents working in this repository. `CLAUDE.md` is a one-line `@AGENTS.md` import, so this file is the single source of truth — add project guidance here, not there. Keep additions outside the `nextjs-agent-rules` markers above; that block is generated and will be overwritten.

## What this project is

A deliberately simple CRM over the **Stripe API**, used to learn how Stripe subscriptions fit together. There is **no database** — Stripe *is* the datastore, and every page reads and writes live Stripe objects.

The domain chain being explored: a **customer** is who gets billed, a **product** is what's sold, a **price** is how much and how often, and a **subscription** binds a customer to a recurring price.

Subscriptions are created via **Stripe-hosted Checkout** (`/api/checkout` → redirect to `checkout.stripe.com`). Deliberately *not* via Stripe Elements: hosted Checkout needs no client-side Stripe SDK and no publishable key, so the whole app keeps talking to Stripe through the server proxy. Card data goes browser → Stripe directly and never reaches this server, which keeps it out of PCI scope.

## Setup

Requires a Stripe **test** key: copy `.env.local.example` to `.env.local` and set `STRIPE_SECRET_KEY=sk_test_...`. Without it, every `/api` call fails with a setup message. The app performs real writes — including deletes — against whatever account the key belongs to, so never point it at a live key.

## Commands

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` (http://localhost:3000) |
| Production build | `npm run build` |
| Serve a build | `npm start` |
| Lint | `npm run lint` (bare `eslint`, not `next lint`) |
| Typecheck | `npx tsc --noEmit` (no script defined) |
| Regenerate route types | `npx next typegen` |

Run `npx next typegen` after adding or renaming a route — the `RouteContext<'/api/...'>` types used by the handlers are generated, and `tsc` fails on a stale or missing route literal.

`next build` does **not** run ESLint in this version — lint is a separate step, so a green build says nothing about lint.

No test framework is installed and there is no `test` script. If you add tests, pick the runner and document the single-test invocation here.

## Reading the docs

The exact docs for the installed version ship inside the package at `node_modules/next/dist/docs/`, and they outrank both your training data and anything on nextjs.org. Highest-signal entry points:

- `01-app/02-guides/upgrading/version-16.md` — the full list of what changed from 15. Read this before assuming any v15-era pattern still works.
- `01-app/03-api-reference/` — per-API reference.

## Version-specific traps

The installed stack is Next.js 16.2.10 / React 19.2.4 / Tailwind v4, which postdates most training data. Verified against the bundled docs:

- **Async request APIs are mandatory.** `cookies`, `headers`, `draftMode`, `params` (layout/page/route/default/metadata image files), and `searchParams` (page) are Promise-only. The v15 synchronous-access fallback is gone — `await` them. `npx next typegen` generates `PageProps<'/route'>`, `LayoutProps`, and `RouteContext` helpers for type-safe access.
- **Turbopack is the default** for `next dev` and `next build`. A `--turbopack` flag is no longer needed; opt out per-command with `--webpack`. Adding a custom `webpack` config to `next.config.ts` makes `next build` **fail by design** rather than silently ignore it.
- **`turbopack` is a top-level `next.config.ts` key**, no longer `experimental.turbopack`.
- **`middleware` is deprecated in favor of `proxy`** — file `proxy.ts`, named export `proxy`. The `proxy` runtime is always `nodejs` and is not configurable; edge-runtime work must stay on `middleware` for now.
- **`next lint` was removed.** Use the ESLint CLI directly.
- Stabilized APIs dropped their `unstable_` prefixes, and `experimental_ppr` route segment config was removed.

Codemods cover most of these: `npx @next/codemod@canary upgrade latest`.

## Architecture

App Router, TypeScript strict, no `src/` directory — `app/` sits at the repo root. Imports resolve through the `@/*` → `./*` path alias.

**The secret key never leaves the server.** The browser talks only to our own `/api/*` routes, which hold the Stripe client and forward to Stripe. This is the point of the project, and it constrains the design:

- `lib/stripe.ts` is the only module that reads `STRIPE_SECRET_KEY`, and it is **server-only** — importing it from a Client Component would bundle the key into browser JS. The client is built lazily so `next build` still succeeds with no key present.
- `lib/client.ts` is the browser-side counterpart: it fetches `/api/*` and unwraps our error envelope. Pages use this, never the Stripe SDK.
- `lib/api.ts` wraps each handler in `proxy()`, which maps `Stripe.errors.StripeError` onto its real status code (so a bad key surfaces as `401`, not `500`).

Pages are Client Components because they exercise that proxy boundary end-to-end, which is the thing being learned. Fetching Stripe directly from a Server Component would be more efficient but would bypass the `/api` layer entirely — that trade is deliberate, not an oversight.

`components/ui.tsx` holds the shared primitives (`Table`, `Field`, `Button`, `Notice`…). `components/sidebar.tsx` is the nav, ordered to mirror the dependency chain.

### Stripe object constraints (these shape the UI)

Stripe is not a uniform CRUD backend, and the API surface is asymmetric. Verified against the installed SDK's own types:

- **Customers** — full CRUD. `del()` exists and hard-deletes.
- **Products** — CRUD, but `del()` only succeeds while **no price has ever referenced the product**. Otherwise archive with `active: false`. The UI attempts the delete and surfaces Stripe's refusal rather than pre-guessing.
- **Prices** — **create, read, update, but never delete.** `PriceResource` has no `del()` method at all. `PriceUpdateParams` accepts only `active`, `nickname`, `metadata`, `lookup_key`, `tax_behavior`, and `currency_options` — **`unit_amount`, `currency`, and `recurring` are immutable**, because live subscriptions bill against a price ID and editing one would retroactively re-bill existing subscribers. Repricing means: archive the old price, create a new one.
- **Subscriptions** — created by Stripe on checkout completion, never by us directly. Cancel with `.cancel()`, **not** `.del()`: the object survives as a `canceled` record. Two distinct cancel paths, and the difference matters — `update({ cancel_at_period_end: true })` is reversible and keeps billing until the period ends; `.cancel()` is immediate and permanent.
- **Deleting a customer cancels their subscriptions immediately.** The customer detail page counts live ones (anything not `canceled`/`incomplete_expired`) and says so in the confirm prompt rather than showing a generic warning.

`app/api/prices/[id]/route.ts` therefore exports **no** `DELETE` (requests correctly 405). Don't "fix" this by aliasing DELETE to an archive — it would teach a wrong model of Stripe. Same reasoning applies to subscriptions: there is no delete.

### `current_period_end` is not on the Subscription

Verified against the installed types **and against live API responses**: `Subscription` has **no** `current_period_end` field — it lives on **`SubscriptionItem`** (`sub.items.data[0].current_period_end`). A real subscription fetched from this account returns `current_period_end: null` at the top level while the item carries the actual timestamp. Older Stripe code and most LLM training data read `subscription.current_period_end`, which silently yields nothing rather than erroring — the symptom is a renewal date that renders as "—" forever and looks like a data problem. Use `periodEnd()` from `lib/format.ts` instead of reaching for it directly.

### Checkout flow

`POST /api/checkout` creates a session with `mode: 'subscription'` and returns `session.url`; the client does a **full-page** `window.location.href` navigation (not `router.push`, which cannot leave the origin). Notes:

- `mode: 'subscription'` **requires a recurring price** — one-time prices are rejected, so the UI filters to `price.recurring && price.active`.
- `success_url` contains the literal `{CHECKOUT_SESSION_ID}` placeholder, which Stripe substitutes on redirect. Don't URL-encode or interpolate it.
- Return URLs are derived from `request.nextUrl.origin`, so no base-URL env var is needed.
- **The redirect back is not what creates the subscription** — Stripe's servers do, and the user may never return. Anything that must happen on payment success belongs in a webhook, not the `success_url` handler. (No webhook handler exists yet.)
- `subscriptions.list()` passes `status: 'all'`; Stripe otherwise omits canceled ones.

### Customer Portal

`POST /api/portal` (`billingPortal.sessions.create`) returns a Stripe-hosted URL for managing billing — subscriptions, invoices, payment methods, self-serve cancel. Same redirect pattern as Checkout, again with no client SDK. Reached from the "Manage billing" button on a customer's detail page.

- **A portal session is scoped to a customer, not a subscription.** `SessionCreateParams` has `customer` and no `subscription` field, so the portal shows *everything* that customer has. You cannot narrow a session to one subscription.
- To target one, pass `flow_data.subscription_cancel.subscription` (the `subscription` field there is required, not optional). `/api/portal` accepts an optional `subscription` in its body to do this, though no UI currently sends one.
- Stripe rejects a cancel flow unless the subscription is `active`, `past_due`, `unpaid`, or `paused` — deep-linking a cancelled one errors. The generic per-customer portal has no such restriction.
- This account has **zero explicit portal configurations** and works on Stripe's implicit defaults. Configure via the dashboard or `billingPortal.configurations.create` to control which features appear and whether cancel is `at_period_end` or `immediately`.

### No auth — the customer id is trusted

`/api/checkout` and `/api/portal` both take a `customer` id straight from the request body. Fine for a local playground with no login, but in production this is an IDOR: a portal session grants full billing control over whatever customer is named. Any real deployment must derive the customer from an authenticated session and never accept it from the client.

### Money

Stripe amounts are in a currency's **minor unit** — `2000` is `$20.00`. Zero-decimal currencies (JPY, KRW, VND…) are the exception, where `2000` means `¥2000`. Always cross the UI boundary through `lib/format.ts` (`toMinorUnits` / `formatAmount`) rather than hand-rolling `* 100`, which silently breaks those currencies.

Styling is **Tailwind v4**, configured entirely in CSS — there is no `tailwind.config.js` and adding one is not how this version is meant to be extended. `app/globals.css` imports Tailwind with `@import "tailwindcss"` and declares the design tokens in an `@theme inline` block, which is what maps `--font-geist-sans` and the background/foreground CSS variables onto utilities like `font-sans` and `bg-background`. Dark mode is driven by a `prefers-color-scheme` media query on `:root`, not a class strategy. `@tailwindcss/postcss` in `postcss.config.mjs` is the only PostCSS plugin.

Fonts come from `next/font/google` (Geist, Geist Mono) in `app/layout.tsx`, which exposes them as CSS variables consumed by the `@theme inline` block.
