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

/** Classify a price delta vs competitors into a chip class. */
export function deltaClass(delta: number | null | undefined, country: Country): string {
  if (delta == null) return "delta-near";
  const band = country === "US" ? 0.05 : 0.02;
  if (delta < -band) return "delta-cheap";
  if (delta > band) return "delta-dear";
  return "delta-near";
}
