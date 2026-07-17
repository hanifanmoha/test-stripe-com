/**
 * Browser-side helper for talking to Stripe *through our proxy*.
 *
 * The proxy (app/api/[...path]/route.ts) is a dumb pipe — it doesn't translate
 * anything — so the browser has to speak Stripe's own wire format. That means:
 *
 *   - paths mirror Stripe exactly:  stripe.get("/v1/customers")  ->  /api/v1/customers
 *   - bodies are form-encoded with Stripe's bracket syntax:
 *       { line_items: [{ price: "p" }] }  ->  line_items[0][price]=p
 *   - query params too:  { expand: ["data.customer"] }  ->  expand[0]=data.customer
 *   - responses are Stripe's raw JSON: lists come back as { object: "list",
 *     data: [...] }, so callers read `.data` themselves.
 *
 * Look in the Network tab and every request body is byte-for-byte what you'd
 * send Stripe with curl. That's the point.
 */

/** Stripe list envelope — the real response shape, not an unwrapped array. */
export type StripeList<T> = {
  object: "list";
  data: T[];
  has_more: boolean;
  url: string;
};

type Params = Record<string, unknown>;

/**
 * Recursively encodes an object into Stripe's form syntax. Skips undefined,
 * null, and "" — Stripe's idiom is to omit optional params, and it also stops a
 * blank edit field from clearing a value on PATCH.
 */
function encode(params: Params, prefix = ""): string {
  const parts: string[] = [];

  for (const [rawKey, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    const key = prefix ? `${prefix}[${rawKey}]` : rawKey;

    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === "object") {
          parts.push(encode(item as Params, `${key}[${i}]`));
        } else {
          parts.push(`${enc(`${key}[${i}]`)}=${enc(String(item))}`);
        }
      });
    } else if (typeof value === "object") {
      parts.push(encode(value as Params, key));
    } else {
      parts.push(`${enc(key)}=${enc(String(value))}`);
    }
  }

  return parts.filter(Boolean).join("&");
}

const enc = encodeURIComponent;

async function send<T>(
  path: string,
  method: string,
  params?: Params,
): Promise<T> {
  const isBodyMethod = method !== "GET" && method !== "DELETE";
  const query = !isBodyMethod && params ? encode(params) : "";

  const res = await fetch(`/api${path}${query ? `?${query}` : ""}`, {
    method,
    ...(isBodyMethod && params
      ? {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: encode(params),
        }
      : {}),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    // Stripe's real error shape is { error: { message, type, ... } }.
    const message =
      (payload as { error?: { message?: string } } | null)?.error?.message ??
      `Request failed (${res.status})`;
    throw new Error(message);
  }

  return payload as T;
}

export const stripe = {
  /** GET with optional Stripe-style query params (expand, status, filters…). */
  get: <T>(path: string, params?: Params) => send<T>(path, "GET", params),
  /**
   * POST — used for BOTH create and update. Stripe's REST API has no PATCH or
   * PUT: `POST /v1/customers` creates, `POST /v1/customers/{id}` updates. (Stripe
   * returns 403 for PATCH, 404 for PUT.)
   */
  post: <T>(path: string, params: Params) => send<T>(path, "POST", params),
  del: <T>(path: string) => send<T>(path, "DELETE"),
};
