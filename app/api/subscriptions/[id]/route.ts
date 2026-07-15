import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { body, proxy } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/subscriptions/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    return stripe().subscriptions.retrieve(id, {
      expand: ["customer", "items.data.price.product"],
    });
  });
}

/**
 * Schedules or un-schedules cancellation at the end of the paid period. This is
 * the reversible option: the subscription stays `active` and keeps billing
 * until the period ends.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/subscriptions/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    const input = await body<{ cancel_at_period_end: boolean }>(request);

    return stripe().subscriptions.update(id, {
      cancel_at_period_end: Boolean(input.cancel_at_period_end),
    });
  });
}

/**
 * Cancels immediately and irreversibly — status goes straight to `canceled`.
 * Note this is `.cancel()`, not `.del()`: the subscription object survives as a
 * historical record rather than being erased.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/subscriptions/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    return stripe().subscriptions.cancel(id);
  });
}
