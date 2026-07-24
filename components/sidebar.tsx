"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Prices are reached through a product, so they get no top-level entry — but
// their routes still live under /prices, hence `also` keeps Products lit up.
const NAV = [
  { href: "/customers", label: "Customers", also: [] as string[] },
  { href: "/products", label: "Products", also: ["/prices"] },
  { href: "/subscriptions", label: "Subscriptions", also: [] as string[] },
  { href: "/invoices", label: "Invoices", also: [] as string[] },
  { href: "/checkout-sessions", label: "Checkout sessions", also: [] as string[] },
  { href: "/tax-rates", label: "Tax rates", also: [] as string[] },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6 px-2">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Stripe CRM
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          test playground
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, also }) => {
          const active = [href, ...also].some((p) => pathname.startsWith(p));
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
