"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";
import type { Country, SiteMapPoint } from "@/lib/types";
import { Card, Pill } from "@/components/ui";
import { BrandBadge } from "@/components/Brand";
import { regionLabel } from "@/lib/geo";
import { deltaClass, formatPrice, unitLabel } from "@/lib/utils";

export function SitesWorkspace({
  us,
  uk,
}: {
  us: SiteMapPoint[];
  uk: SiteMapPoint[];
}) {
  const [country, setCountry] = useState<Country>("US");
  const [brand, setBrand] = useState<string>("all");
  const [query, setQuery] = useState("");

  const all = country === "US" ? us : uk;

  const brands = useMemo(
    () => Array.from(new Set(all.map((s) => s.site.brand))).sort(),
    [all]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((s) => {
      if (brand !== "all" && s.site.brand !== brand) return false;
      if (!q) return true;
      return (
        s.site.name.toLowerCase().includes(q) ||
        s.site.brand.toLowerCase().includes(q) ||
        regionLabel(s.site.country, s.site.region).toLowerCase().includes(q)
      );
    });
  }, [all, brand, query]);

  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-full border border-eg-line text-sm">
            {(["US", "UK"] as Country[]).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCountry(c);
                  setBrand("all");
                }}
                className={
                  c === country
                    ? "bg-eg-navy px-3.5 py-1.5 font-medium text-white"
                    : "px-3.5 py-1.5 text-eg-ink-soft hover:bg-eg-surface-2"
                }
              >
                {c}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-48">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-eg-ink-soft"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, brand or region…"
              className="w-full rounded-xl border border-eg-line bg-eg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-eg-navy"
            />
          </div>

          <select
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="rounded-xl border border-eg-line bg-eg-surface px-3 py-2 text-sm"
          >
            <option value="all">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <span className="ml-auto text-xs text-eg-ink-soft">
            {filtered.length} site{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <SiteCard key={s.site.siteId} point={s} />
        ))}
      </div>
    </div>
  );
}

function SiteCard({ point }: { point: SiteMapPoint }) {
  const { site } = point;
  const u = unitLabel(site.country);
  const delta = point.delta;
  const band = site.country === "US" ? 0.05 : 0.02;
  const tone =
    delta == null ? "neutral" : delta < -band ? "good" : delta > band ? "bad" : "watch";
  const label =
    delta == null ? "—" : delta < -band ? "Cheaper" : delta > band ? "Dearer" : "In line";

  return (
    <div className="card flex flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/site/${site.siteId}`}
            className="block truncate font-semibold text-eg-ink hover:text-eg-navy"
          >
            {site.name}
          </Link>
          <div className="text-xs text-eg-ink-soft">
            {regionLabel(site.country, site.region)}, {site.country}
          </div>
        </div>
        <BrandBadge brand={site.brand} />
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-eg-ink-soft">
            Regular price
          </div>
          <div className="kpi-num text-xl font-bold text-eg-navy">
            {formatPrice(point.price, site.currency)}
            <span className="text-xs font-medium text-eg-ink-soft">{u}</span>
          </div>
        </div>
        <Pill tone={tone}>{label}</Pill>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-eg-line pt-3 text-xs text-eg-ink-soft">
        <span>
          Rivals {formatPrice(point.competitorAvg, site.currency)} · margin{" "}
          <span className={`rounded px-1 ${deltaClass(delta, site.country)}`}>
            {formatPrice(point.margin, site.currency)}
            {u}
          </span>
        </span>
        <Link
          href={`/site/${site.siteId}`}
          className="inline-flex items-center gap-1 font-medium text-eg-navy hover:underline"
        >
          <Sparkles size={12} /> Optimise
        </Link>
      </div>
    </div>
  );
}
