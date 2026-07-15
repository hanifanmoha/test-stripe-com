import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { body, clean, proxy } from "@/lib/api";

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/customers/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    return stripe().customers.retrieve(id);
  });
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/customers/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    const input = await body<{
      name: string;
      email: string;
      phone: string;
      description: string;
    }>(request);

    return stripe().customers.update(id, clean(input));
  });
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/customers/[id]">,
) {
  return proxy(async () => {
    const { id } = await ctx.params;
    return stripe().customers.del(id);
  });
}
