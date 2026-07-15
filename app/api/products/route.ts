import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { body, clean, proxy } from "@/lib/api";

export async function GET() {
  return proxy(async () => {
    // active: undefined returns both active and archived products.
    const list = await stripe().products.list({ limit: 100 });
    return list.data;
  });
}

export async function POST(request: NextRequest) {
  return proxy(async () => {
    const input = await body<{ name: string; description: string }>(request);
    if (!input.name) throw new Error("Product name is required.");

    return stripe().products.create(clean(input) as { name: string });
  });
}
