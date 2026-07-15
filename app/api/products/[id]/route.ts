import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { body, clean, proxy } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/products/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    return stripe().products.retrieve(id);
  });
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/products/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    const input = await body<{
      name: string;
      description: string;
      active: boolean;
    }>(request);

    // `active` is a real boolean, so it must bypass clean()'s empty-string filter.
    const { active, ...rest } = input;
    return stripe().products.update(id, {
      ...clean(rest),
      ...(active === undefined ? {} : { active }),
    });
  });
}

/**
 * Stripe only permits a hard delete when no Price has ever referenced the
 * product. That's common in this playground, so we attempt the delete and let
 * Stripe's own error explain the archive-instead path.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/products/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    return stripe().products.del(id);
  });
}
