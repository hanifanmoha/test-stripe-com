import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { proxy } from "@/lib/api";

export async function GET(request: NextRequest) {
  return proxy(async () => {
    const customer = request.nextUrl.searchParams.get("customer") ?? undefined;

    const list = await stripe().subscriptions.list({
      limit: 100,
      // Without this, Stripe omits canceled subscriptions — and seeing a
      // cancellation land is half the point of this screen.
      status: "all",
      ...(customer ? { customer } : {}),
      expand: ["data.customer"],
    });
    return list.data;
  });
}
