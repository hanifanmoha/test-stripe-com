import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { body, clean, proxy } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/prices/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    return stripe().prices.retrieve(id, { expand: ["product"] });
  });
}

/**
 * Only a price's presentational/lifecycle fields are mutable. `unit_amount`,
 * `currency`, and `recurring` are fixed at creation because live subscriptions
 * reference the price by id — editing an amount would silently re-bill existing
 * subscribers. To change an amount: archive this price, create a new one.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/prices/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    const input = await body<{
      nickname: string;
      active: boolean;
    }>(request);

    const { active, ...rest } = input;
    return stripe().prices.update(id, {
      ...clean(rest),
      ...(active === undefined ? {} : { active }),
    });
  });
}

// No DELETE export by design: the Stripe API has no price-delete endpoint, so
// requests to it correctly 405 rather than pretending. Archive via
// PATCH { active: false }.
