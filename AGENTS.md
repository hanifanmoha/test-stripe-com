<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project guidance

Guidance for AI coding agents working in this repository. `CLAUDE.md` is a one-line `@AGENTS.md` import, so this file is the single source of truth — add project guidance here, not there. Keep additions outside the `nextjs-agent-rules` markers above; that block is generated and will be overwritten.

## What this project is

A deliberately simple CRM over the **Stripe API**, used to learn how Stripe subscriptions fit together. There is **no database** — Stripe *is* the datastore, and every page reads and writes live Stripe objects.

The domain chain being explored: a **customer** is who gets billed, a **product** is what's sold, a **price** is how much and how often, and a **subscription** binds a customer to a recurring price.

Subscriptions are created via **Stripe-hosted Checkout** (client POSTs `/api/v1/checkout/sessions` through the proxy → redirect to `checkout.stripe.com`). Deliberately *not* via Stripe Elements: hosted Checkout needs no client-side Stripe SDK and no publishable key, so the whole app keeps talking to Stripe through the server proxy. Card data goes browser → Stripe directly and never reaches this server, which keeps it out of PCI scope.

**[CHECKOUT.md](CHECKOUT.md) compares all the payment flows and documents why this one was chosen.** Read it before proposing a switch to Elements or embedded checkout — the tradeoff is already written down.

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

**The secret key never leaves the server.** The browser talks only to our own `/api/*` route, which attaches the key and forwards to Stripe. This is the point of the project.

**The backend is a single transparent proxy — it does not use the Stripe SDK, and it does not reshape anything.** This is deliberate (see the "Transparent proxy" note below): the whole request/response is meant to be inspectable and 1:1 with Stripe's own API.

- `app/api/[...path]/route.ts` is the **entire backend**: a catch-all that forwards any method/path/query/body from `/api/v1/...` to `https://api.stripe.com/v1/...`, adding only `Authorization: Bearer sk_...`, and returns Stripe's response verbatim (same status, same JSON). There are no per-resource route files.
- `lib/stripe.ts` is server-only and now just holds the key + API base (no SDK client). Importing it from a Client Component would bundle the key into browser JS.
- `lib/client.ts` is the browser side: `stripe.get/post/patch/del` speak Stripe's **native wire format** — paths like `/v1/customers`, form-encoded bodies with bracket syntax (`line_items[0][price]`), `expand[0]=` query params — and return Stripe's **raw** JSON. Lists come back as `{ object: "list", data: [...] }`, so pages read `.data` themselves.
- The `stripe` npm package remains installed for its **TypeScript types only** (`import type Stripe`). No runtime SDK import anywhere.

Pages are Client Components because they exercise that proxy boundary end-to-end, which is the thing being learned. Because the backend doesn't translate anything, the pages assemble real Stripe params (e.g. `recurring: { interval }` on price create, the full `line_items` + `success_url` on checkout) — so the exact Stripe request is visible in the page and in the Network tab.

`components/ui.tsx` holds the shared primitives (`Table`, `Field`, `Button`, `Notice`…). `components/sidebar.tsx` is the nav, ordered to mirror the dependency chain.

### Transparent proxy (why the backend is one catch-all)

The backend's only job is to mask the secret key. It is **not** an anti-corruption layer and must stay that way:

- **Same paths as Stripe.** `/api/v1/<x>` maps to `https://api.stripe.com/v1/<x>`, 1:1. Easy to compare against Stripe's docs or replay with curl.
- **Raw responses.** Never unwrap `.data`, never remap error shapes on the server. Stripe's `{ object: "list", ... }` and `{ error: { message, type } }` reach the client intact. (The one synthetic response is the missing-key 500, which mirrors Stripe's error shape.)
- **Client speaks Stripe.** Form-encoding lives in `lib/client.ts`'s `encode()`, which drops `undefined`/`null`/`""` (so a blank PATCH field can't clear a value) and emits bracket syntax. Don't move this to the server — that would make the backend translate again.
- **`.cancel()` is `DELETE /v1/subscriptions/{id}`**, `.del()` on customers/products is `DELETE /v1/...` — the SDK method names map onto plain HTTP verbs, which is why the client just uses `del()`.

**Security:** the catch-all is an open, unauthenticated passthrough — the browser can call *any* endpoint the key allows. Acceptable only for this local single-user playground; a real deployment must authenticate the caller and allowlist paths/methods.

### Stripe object constraints (these shape the UI)

Stripe is not a uniform CRUD backend, and the API surface is asymmetric. Verified against the installed SDK's own types:

- **Customers** — full CRUD. `del()` exists and hard-deletes.
- **Products** — CRUD, but `del()` only succeeds while **no price has ever referenced the product**. Otherwise archive with `active: false`. The UI attempts the delete and surfaces Stripe's refusal rather than pre-guessing.
- **Prices** — **create, read, update, but never delete.** `PriceResource` has no `del()` method at all. `PriceUpdateParams` accepts only `active`, `nickname`, `metadata`, `lookup_key`, `tax_behavior`, and `currency_options` — **`unit_amount`, `currency`, and `recurring` are immutable**, because live subscriptions bill against a price ID and editing one would retroactively re-bill existing subscribers. Repricing means: archive the old price, create a new one.
- **Subscriptions** — created by Stripe on checkout completion, never by us directly. Cancel with `.cancel()`, **not** `.del()`: the object survives as a `canceled` record. Two distinct cancel paths, and the difference matters — `update({ cancel_at_period_end: true })` is reversible and keeps billing until the period ends; `.cancel()` is immediate and permanent.
- **Deleting a customer cancels their subscriptions immediately.** The customer detail page counts live ones (anything not `canceled`/`incomplete_expired`) and says so in the confirm prompt rather than showing a generic warning.

Stripe has **no** price-delete endpoint, so a `DELETE /api/v1/prices/{id}` forwarded through the proxy comes back `405` from Stripe itself — and the UI never offers a delete button for prices. Don't add one that aliases to an archive; it would teach a wrong model of Stripe. Same reasoning applies to subscriptions: cancel (`DELETE /v1/subscriptions/{id}`) is not delete — the object survives as `canceled`.

### `current_period_end` is not on the Subscription

Verified against the installed types **and against live API responses**: `Subscription` has **no** `current_period_end` field — it lives on **`SubscriptionItem`** (`sub.items.data[0].current_period_end`). A real subscription fetched from this account returns `current_period_end: null` at the top level while the item carries the actual timestamp. Older Stripe code and most LLM training data read `subscription.current_period_end`, which silently yields nothing rather than erroring — the symptom is a renewal date that renders as "—" forever and looks like a data problem. Use `periodEnd()` from `lib/format.ts` instead of reaching for it directly.

### Checkout flow

The **client** builds the full session request and POSTs `/api/v1/checkout/sessions` (`app/subscriptions/new/page.tsx`); on the returned `session.url` it does a **full-page** `window.location.href` navigation (not `router.push`, which cannot leave the origin). Notes:

- `mode: 'subscription'` **requires a recurring price** — one-time prices are rejected, so the UI filters to `price.recurring && price.active`.
- `success_url` contains the literal `{CHECKOUT_SESSION_ID}` placeholder, which Stripe substitutes on redirect. The client encoder URL-escapes the braces on the wire and Stripe stores them decoded — verified round-trip.
- Return URLs are derived from `window.location.origin`, so no base-URL env var is needed.
- **The redirect back is not what creates the subscription** — Stripe's servers do, and the user may never return. The success page reads back `session_id` and retrieves the session (`/api/v1/checkout/sessions/{id}`) to show a verified receipt, but that's a fast path, not a substitute for a webhook. Anything that must happen on payment success belongs in a webhook. (No webhook handler exists yet.)
- The subscriptions list sends `status=all`; Stripe otherwise omits canceled ones.

### Customer Portal

The client POSTs `/api/v1/billing_portal/sessions` with `{ customer, return_url }` and redirects to the returned URL — Stripe-hosted billing management (subscriptions, invoices, payment methods, self-serve cancel). Same redirect pattern as Checkout. Reached from the "Manage billing" button on a customer's detail page.

- **A portal session is scoped to a customer, not a subscription.** `SessionCreateParams` has `customer` and no `subscription` field, so the portal shows *everything* that customer has. You cannot narrow a session to one subscription.
- To target one, pass `flow_data[type]=subscription_cancel` + `flow_data[subscription_cancel][subscription]=sub_…` (required). No UI currently sends this; the client would just include it in the POST body.
- Stripe rejects a cancel flow unless the subscription is `active`, `past_due`, `unpaid`, or `paused` — deep-linking a cancelled one errors. The generic per-customer portal has no such restriction.
- This account has **zero explicit portal configurations** and works on Stripe's implicit defaults. Configure via the dashboard or `billing_portal/configurations` to control which features appear and whether cancel is `at_period_end` or `immediately`.

### No auth — the whole proxy is trusted

Checkout and portal both take a `customer` id from the client, and the catch-all proxy will forward **any** call the secret key permits. Fine for a local playground with no login, but in production this is a wide-open IDOR/abuse surface: the browser could name any customer, or hit any Stripe endpoint. Any real deployment must authenticate the caller, derive the customer from the session, and allowlist which paths/methods the proxy forwards.

### Money

Stripe amounts are in a currency's **minor unit** — `2000` is `$20.00`. Zero-decimal currencies (JPY, KRW, VND…) are the exception, where `2000` means `¥2000`. Always cross the UI boundary through `lib/format.ts` (`toMinorUnits` / `formatAmount`) rather than hand-rolling `* 100`, which silently breaks those currencies.

Styling is **Tailwind v4**, configured entirely in CSS — there is no `tailwind.config.js` and adding one is not how this version is meant to be extended. `app/globals.css` imports Tailwind with `@import "tailwindcss"` and declares the design tokens in an `@theme inline` block, which is what maps `--font-geist-sans` and the background/foreground CSS variables onto utilities like `font-sans` and `bg-background`. Dark mode is driven by a `prefers-color-scheme` media query on `:root`, not a class strategy. `@tailwindcss/postcss` in `postcss.config.mjs` is the only PostCSS plugin.

Fonts come from `next/font/google` (Geist, Geist Mono) in `app/layout.tsx`, which exposes them as CSS variables consumed by the `@theme inline` block.
