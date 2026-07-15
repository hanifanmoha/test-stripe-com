import type { ApiError } from "./api";

/**
 * Browser-side fetch against our own /api proxy — never against Stripe
 * directly, which would require exposing the secret key.
 */
async function request<T>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: json ? JSON.stringify(json) : undefined,
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((payload as ApiError)?.error ?? `Request failed (${res.status})`);
  }
  return payload as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, json: unknown) => request<T>(url, { method: "POST", json }),
  patch: <T>(url: string, json: unknown) => request<T>(url, { method: "PATCH", json }),
  del: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};
