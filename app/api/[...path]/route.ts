import type { NextRequest } from "next/server";
import { STRIPE_API_BASE, stripeKey } from "@/lib/stripe";

/**
 * Transparent Stripe proxy. Its ONLY job is to attach the secret key so it
 * never reaches the browser; it does not reshape the request or the response.
 *
 *   browser  ->  /api/v1/customers        (and any other /v1/... path)
 *   here     ->  https://api.stripe.com/v1/customers
 *
 * Everything is forwarded verbatim: HTTP method, the path after /api/, the
 * query string, and the request body with its Content-Type. We add exactly one
 * thing — `Authorization: Bearer sk_...` — and hand Stripe's response back
 * untouched, same status code, same JSON. So `/api/v1/...` and Stripe's
 * `/v1/...` are the same call, which makes it trivial to compare against
 * Stripe's docs or replay with curl.
 *
 * Because the browser speaks Stripe's own wire format (form-encoded bodies,
 * `expand[0]=` query params — see lib/client.ts), there's nothing to translate.
 *
 * SECURITY: this is a wide-open, unauthenticated proxy to a Stripe account —
 * the browser can call ANY endpoint the secret key permits (refunds, deletes,
 * anything). That's acceptable only because this is a local, single-user
 * playground. A real deployment must authenticate the caller and restrict which
 * paths and methods are allowed; never ship an open passthrough like this.
 */
async function forward(
  request: NextRequest,
  ctx: RouteContext<"/api/[...path]">,
): Promise<Response> {
  let key: string;
  try {
    key = stripeKey();
  } catch (err) {
    // Our own precondition, not a Stripe response. Mirror Stripe's error shape
    // so the client can read it the same way.
    const message = err instanceof Error ? err.message : "Server misconfigured";
    return Response.json({ error: { message } }, { status: 500 });
  }

  const { path } = await ctx.params;
  const target = `${STRIPE_API_BASE}/${path.join("/")}${request.nextUrl.search}`;

  const headers: HeadersInit = { Authorization: `Bearer ${key}` };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const stripeResponse = await fetch(target, {
    method: request.method,
    headers,
    // Pass the body through as-is (form-encoded, exactly what Stripe expects).
    ...(hasBody ? { body: await request.text() } : {}),
  });

  // Return Stripe's response unchanged: same status, same body, same type.
  return new Response(stripeResponse.body, {
    status: stripeResponse.status,
    headers: {
      "Content-Type":
        stripeResponse.headers.get("content-type") ?? "application/json",
    },
  });
}

// Stripe's REST API only uses these three verbs — create AND update are both
// POST, retrieve/list are GET, cancel/delete are DELETE. It has no PATCH or PUT
// (they return 403/404), so we don't expose them: an unknown method here 405s.
export const GET = forward;
export const POST = forward;
export const DELETE = forward;
