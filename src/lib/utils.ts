import { clsx, type ClassValue } from "clsx";
import type { Country } from "@/lib/types";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Format a price in the site's currency unit. */
export function formatPrice(value: number | null | undefined, currency: string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const symbol = currency === "USD" ? "$" : currency === "GBP" ? "£" : "";
  // US gallon prices show 2dp; UK litre prices show 3dp (pence).
  const dp = currency === "GBP" ? 3 : 2;
  return `${symbol}${value.toFixed(dp)}`;
}

export function unitLabel(country: Country): string {
  return country === "US" ? "/gal" : "/L";
}

/** Currency symbol for a currency code. */
export function currencySymbol(currency: string): string {
  return currency === "USD" ? "$" : currency === "GBP" ? "£" : "";
}

/**
 * Compact currency for big aggregate figures (e.g. daily margin pools):
 *   1234 -> $1.2k, 1_250_000 -> $1.25M
 */
export function formatCompactMoney(
  value: number | null | undefined,
  currency: string
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const symbol = currencySymbol(currency);
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

/** Compact count (e.g. 1.2M gal/day) without a currency symbol. */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${Math.round(abs)}`;
}

/**
 * Compact relative time from an ISO timestamp, e.g. "just now", "5m ago",
 * "2h ago", "3d ago". Returns "—" for unparseable input.
 *
 * Note: recommendation timestamps are real wall-clock time (the agents write
 * created_at via the DB default), not the simulation clock — so this reflects
 * how long ago the agents actually produced the recommendation.
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.round(month / 12)}y ago`;
}

/**
 * Age of something on the SIMULATED clock: how many sim days ago it happened,
 * given the day index it was created on and the current sim day index. Used so
 * recommendation ages track the moving sim clock rather than real wall-clock
 * time. Returns null when either input is missing (caller can fall back to
 * real-time formatting).
 */
export function formatSimAge(
  createdDay: number | null | undefined,
  currentDay: number | null | undefined
): string | null {
  if (createdDay == null || currentDay == null) return null;
  const d = Math.max(0, Math.round(currentDay - createdDay));
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

/** Absolute, human-readable timestamp for tooltips, e.g. "May 31, 14:10". */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Classify a price delta vs competitors into a chip class. */
export function deltaClass(delta: number | null | undefined, country: Country): string {
  if (delta == null) return "delta-near";
  const band = country === "US" ? 0.05 : 0.02;
  if (delta < -band) return "delta-cheap";
  if (delta > band) return "delta-dear";
  return "delta-near";
}
