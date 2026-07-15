import Stripe from "stripe";

export type ApiError = { error: string; type?: string };

/**
 * Wraps a proxy handler so Stripe's errors reach the browser as JSON with a
 * sensible status, instead of a generic 500 with a stack trace.
 */
export async function proxy<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      return Response.json(
        { error: err.message, type: err.type } satisfies ApiError,
        { status: err.statusCode ?? 500 },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message } satisfies ApiError, {
      status: 500,
    });
  }
}

/** Parses a JSON body, returning {} rather than throwing on an empty body. */
export async function body<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** Drops undefined/empty-string values so we never send blanks to Stripe. */
export function clean<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>;
}
