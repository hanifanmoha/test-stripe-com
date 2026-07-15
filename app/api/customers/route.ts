import type { NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { body, clean, proxy } from "@/lib/api";

export async function GET() {
  return proxy(async () => {
    const list = await stripe().customers.list({ limit: 100 });
    return list.data;
  });
}

export async function POST(request: NextRequest) {
  return proxy(async () => {
    const input = await body<{
      name: string;
      email: string;
      phone: string;
      description: string;
    }>(request);

    return stripe().customers.create(clean(input));
  });
}
