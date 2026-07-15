"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const styles = {
    primary:
      "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200",
    secondary:
      "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
    danger:
      "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const styles = {
    primary:
      "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200",
    secondary:
      "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
  }[variant];

  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors ${styles}`}
    >
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-400 dark:disabled:bg-zinc-900";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClass} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClass} />;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {message}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {children}
    </div>
  );
}

export function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {active ? "Active" : "Archived"}
    </span>
  );
}

/**
 * Subscription statuses carry more meaning than active/archived — `incomplete`
 * means checkout was never paid, `past_due` means a renewal failed.
 */
export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    trialing: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    past_due: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    unpaid: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    incomplete: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    incomplete_expired: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    canceled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    paused: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        tone[status] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
      {children}
    </code>
  );
}

export function Table({
  headers,
  children,
  empty,
  isEmpty,
}: {
  headers: string[];
  children: ReactNode;
  empty: string;
  isEmpty: boolean;
}) {
  if (isEmpty) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 py-16 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        {empty}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {children}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The whole row navigates on click. The first cell stays a real <a> so the row
 * remains keyboard-reachable and supports ctrl/middle-click to open in a new
 * tab — behaviour a click handler alone would silently drop.
 */
export function Row({
  href,
  cells,
}: {
  href: string;
  cells: ReactNode[];
}) {
  const router = useRouter();

  return (
    <tr
      onClick={() => router.push(href)}
      className="group cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      {cells.map((cell, i) => (
        <td key={i} className="px-4 py-3">
          {i === 0 ? (
            <Link
              href={href}
              // The row handler already navigates; without this the click would
              // fire twice and push a duplicate history entry.
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-zinc-900 group-hover:underline dark:text-zinc-100"
            >
              {cell}
            </Link>
          ) : (
            cell
          )}
        </td>
      ))}
    </tr>
  );
}

export function Loading() {
  return (
    <div className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
      Loading…
    </div>
  );
}

export function DetailList({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {items.map(({ label, value }) => (
        <div key={label} className="grid grid-cols-3 gap-4 px-4 py-3">
          <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
          <dd className="col-span-2 text-sm text-zinc-900 dark:text-zinc-100">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
