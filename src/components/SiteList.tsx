"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { Country, SiteMapPoint } from "@/lib/types";
import { BrandBadge } from "@/components/Brand";
import { AgentRoom } from "@/components/AgentRoom";
import { formatPrice, unitLabel, deltaClass } from "@/lib/utils";

export function SiteList({
  us,
  uk,
}: {
  us: SiteMapPoint[];
  uk: SiteMapPoint[];
}) {
  const [country, setCountry] = useState<Country>("US");
  const [roomSiteId, setRoomSiteId] = useState<string | null>(null);

  const points = country === "US" ? us : uk;
  const roomSite = points.find((p) => p.site.siteId === roomSiteId)?.site ?? null;

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-eg-line px-4 py-3">
        <h2 className="text-sm font-semibold text-eg-ink">Sites</h2>
        <div className="inline-flex overflow-hidden rounded-full border border-eg-line text-xs">
          {(["US", "UK"] as Country[]).map((c) => (
            <button
              key={c}
              onClick={() => setCountry(c)}
              className={
                c === country
                  ? "bg-eg-navy px-3 py-1 font-medium text-white"
                  : "px-3 py-1 text-eg-ink-soft hover:bg-eg-surface-2"
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-eg-line">
        {points.map((p) => (
          <div key={p.site.siteId} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/site/${p.site.siteId}`}
                  className="truncate text-sm font-medium text-eg-ink hover:text-eg-navy"
                >
                  {p.site.name}
                </Link>
                <BrandBadge brand={p.site.brand} />
              </div>
              <div className="text-xs text-eg-ink-soft">
                {p.site.region}, {p.site.country}
              </div>
            </div>

            <div className="text-right">
              <div className="kpi-num text-sm font-semibold text-eg-ink">
                {formatPrice(p.price, p.site.currency)}
                <span className="text-xs font-normal text-eg-ink-soft">
                  {unitLabel(p.site.country)}
                </span>
              </div>
              {p.delta != null && (
                <span
                  className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] ${deltaClass(
                    p.delta,
                    p.site.country
                  )}`}
                >
                  {p.delta >= 0 ? "+" : ""}
                  {formatPrice(p.delta, p.site.currency)} vs comp
                </span>
              )}
            </div>

            <button
              onClick={() => setRoomSiteId(p.site.siteId)}
              className="inline-flex items-center gap-1 rounded-lg bg-eg-navy px-2.5 py-1.5 text-xs font-medium text-white hover:bg-eg-navy-600"
            >
              <Sparkles size={13} /> Optimise
            </button>
          </div>
        ))}
      </div>

      {roomSite && (
        <AgentRoom
          site={roomSite}
          open={!!roomSite}
          onClose={() => setRoomSiteId(null)}
        />
      )}
    </div>
  );
}
