import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { body, proxy } from "@/lib/api";

export async function GET(request: NextRequest) {
  return proxy(async () => {
    const product = request.nextUrl.searchParams.get("product") ?? undefined;
    const list = await stripe().prices.list({
      limit: 100,
      ...(product ? { product } : {}),
      expand: ["data.product"],
    });
    return list.data;
  });
}

export async function POST(request: NextRequest) {
  return proxy(async () => {
    const input = await body<{
      product: string;
      currency: string;
      unit_amount: number;
      nickname: string;
      interval: Stripe.PriceCreateParams.Recurring.Interval | "one_time";
    }>(request);

    if (!input.product) throw new Error("A product is required.");
    if (typeof input.unit_amount !== "number" || Number.isNaN(input.unit_amount))
      throw new Error("A unit amount is required.");

    const params: Stripe.PriceCreateParams = {
      product: input.product,
      currency: input.currency || "usd",
      unit_amount: input.unit_amount,
      ...(input.nickname ? { nickname: input.nickname } : {}),
    };

    // A price is recurring or one-time at creation, and can never switch later.
    if (input.interval && input.interval !== "one_time") {
      params.recurring = { interval: input.interval };
    }

    return stripe().prices.create(params);
  });
}
