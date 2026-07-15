# Checkout flows

How a subscription actually gets paid for, what the options are, and which one this project uses.

## What this project implements

**Stripe-hosted Checkout** — `ui_mode: hosted_page`, which is the default. We create a Checkout Session server-side, hand the browser its `url`, and let it navigate to `checkout.stripe.com`. Stripe collects the card, creates the subscription, and redirects back.

Chosen because it's the only flow that needs **no Stripe SDK in the browser and no publishable key**, which keeps every Stripe call behind the server proxy — the point of this project.

Files: [`app/api/checkout/route.ts`](app/api/checkout/route.ts) creates the session, [`app/subscriptions/new/page.tsx`](app/subscriptions/new/page.tsx) redirects to it.

## The options

Roughly ordered by how much you build yourself.

### 1. No payment UI — server-side only (test mode only)

Attach a Stripe-provided test payment method to a customer and call `subscriptions.create()` directly. Nothing to click.

```
stripe.paymentMethods.attach('pm_card_visa', { customer })
stripe.subscriptions.create({ customer, items: [{ price }], default_payment_method })
```

**Only works in test mode.** `pm_card_visa` is a pre-tokenized fake card. In live mode there's no way to conjure a payment method server-side, because raw card details may never touch your server. Good for learning the subscription lifecycle without payment noise; useless in production.

### 2. Payment Links — no code at all

`paymentLinks.create({ line_items })` (or click it out in the dashboard) gives a reusable URL you paste anywhere. Stripe hosts everything.

No per-customer session, so it fits "sell to strangers from a landing page" better than "subscribe this known customer", though `customer_creation` lets Stripe make the customer for you. Zero integration work; correspondingly little control.

### 3. Stripe-hosted Checkout — **what this project uses**

`checkout.sessions.create({ mode: 'subscription', ... })` → redirect to the returned `url`.

- **No client SDK, no publishable key.** Just a redirect.
- Card details are entered on Stripe's domain, so they never reach this server — that's what keeps it out of PCI scope.
- You get Apple Pay, Google Pay, 3D Secure, tax, and localisation for free.
- Cost: it's Stripe's page, on Stripe's domain. Branding is configurable, layout isn't.

### 4. Embedded Checkout — `ui_mode: 'embedded_page'`

The same Checkout, rendered inside an iframe on your own page instead of a redirect.

- Needs `@stripe/stripe-js` in the browser, initialised with a **publishable** key.
- The session returns a `client_secret` instead of a `url` — you pass it to Stripe.js embedded checkout.
- `success_url` is **not allowed**; use `return_url` / `redirect_on_completion` instead.
- Card data still goes browser → Stripe directly. Your server stays out of PCI scope.

Worth it when leaving your domain hurts conversion.

### 5. Elements / custom — `ui_mode: 'elements'`

Maximum control: you build the form, Stripe supplies the secure card inputs.

- Needs `@stripe/stripe-js`; the session's `client_secret` goes to `initCheckout` on the front end.
- Also the classic non-Checkout variant: create the subscription with `payment_behavior: 'default_incomplete'`, then confirm client-side with the Payment Element.
- Most work, most control. Card fields are still Stripe-owned iframes, so PCI scope stays off your server.

> The `ui_mode` union in the installed SDK is `'elements' | 'embedded_page' | 'form' | 'hosted_page'`. The bundled type definitions carry no explanation of `form`, so it's listed here for completeness only — check the live docs before using it.

## Comparison

| | Client SDK? | Publishable key? | Whose UI | Sees raw card data |
| --- | --- | --- | --- | --- |
| 1. Server-only (test) | no | no | none | nobody (fake card) |
| 2. Payment Link | no | no | Stripe | Stripe |
| **3. Hosted Checkout** ← ours | **no** | **no** | Stripe | Stripe |
| 4. Embedded Checkout | yes | yes | Stripe, in your page | Stripe |
| 5. Elements / custom | yes | yes | yours | Stripe (iframed inputs) |

In no case does your own server touch card details. That's the whole design of every Stripe integration — the differences are about **where the UI lives**, not about who is trusted with the card.

The secret key (`sk_test_…`) never leaves the server in any of these. The publishable key (`pk_test_…`) that flows 4 and 5 need is *designed* to be public, so using them wouldn't weaken this project's proxy model — it would just add a second key.

## The implemented flow, step by step

1. **`/subscriptions/new`** — pick a customer and a recurring price. The list is filtered to `price.recurring && price.active`, because `mode: 'subscription'` rejects one-time prices.
2. **`POST /api/checkout`** — the server creates the session. The secret key is used here and only here.
3. Response carries `url` (a `checkout.stripe.com` address) and `status: 'open'`.
4. **`window.location.href = url`** — a full-page navigation, not `router.push`; the client router can't leave the origin.
5. Customer pays on Stripe's domain. Test card `4242 4242 4242 4242`, any future expiry, any CVC — see [all test cards](https://docs.stripe.com/testing?testing-method=card-numbers#cards).
6. **Stripe creates the subscription**, then redirects to `success_url` (or `cancel_url` if abandoned).
7. `/subscriptions?checkout=success` shows a banner and re-lists.

### The raw HTTP

The SDK call in `app/api/checkout/route.ts` is just this:

```bash
curl https://api.stripe.com/v1/checkout/sessions \
  -u "$STRIPE_SECRET_KEY:" \
  -d mode=subscription \
  -d customer=cus_123 \
  -d "line_items[0][price]=price_123" \
  -d "line_items[0][quantity]=1" \
  --data-urlencode "success_url=http://localhost:3000/subscriptions?checkout=success&session_id={CHECKOUT_SESSION_ID}" \
  --data-urlencode "cancel_url=http://localhost:3000/subscriptions?checkout=cancelled"
```

`--data-urlencode` on the URLs is mandatory: with a plain `-d`, curl reads the `&` before `session_id` as a field separator and Stripe rejects the call with *"Received unknown parameter: session_id"*.

## The gap: no webhook

**Step 6 is the important one, and it does not depend on the browser coming back.** Stripe's servers create the subscription on payment success. The redirect to `success_url` is only where the *user* lands — and they might close the tab, lose signal, or never return. The subscription exists either way.

So `success_url` is a UI convenience, not an event. Anything that must happen on payment — provisioning access, sending a receipt, marking an order paid — belongs in a **webhook** on `checkout.session.completed`. This project has none, which is why the list sometimes needs a refresh after paying. That's tolerable in a playground and unacceptable in production.

## Related, but not checkout

The **Customer Portal** ([`app/api/portal/route.ts`](app/api/portal/route.ts)) is the same redirect pattern — server creates a session, browser navigates to Stripe — but it *manages* existing billing rather than starting it: view subscriptions and invoices, update payment methods, self-serve cancel. It's scoped per customer, not per subscription. See [README.md](README.md).
