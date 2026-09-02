import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------------------------------------------ money --

   Money is integer cents everywhere in this codebase. These are the only
   places a conversion is allowed to happen.
--------------------------------------------------------------------------- */

/**
 * An amount of money, always rendered as a number.
 *
 * Use this for totals, earnings and fees. `formatPrice` renders 0 as "Free",
 * which is right when asking someone to pay but wrong on a dashboard — a
 * vendor whose earnings are zero should see "$0", not be told their earnings
 * are "Free".
 */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** A price offered to a buyer. Zero reads as "Free" — that is the offer. */
export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    // Show 1.99 as $1.99 but 5.00 as $5 — cleaner in dense grids.
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * A cents amount as it should appear in a text box the user will edit.
 *
 * "5" not "5.00" when the amount is whole — less to delete when retyping.
 * Shared by the buyer's price control and the vendor's product form so the two
 * cannot disagree about how a price is written.
 */
export function formatAmountForInput(cents: number): string {
  if (cents === 0) return "0";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** Parses user-typed price input ("5", "$5.00", "5,50") into cents. */
export function parsePriceToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,]/g, "").replace(/,/g, ".");
  if (cleaned === "") return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

/** URL-safe slug. Used for product and tag slugs on import and on upload. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
