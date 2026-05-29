"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { PriceHistory, SiteSnapshot } from "@/lib/types";
import { BrandBadge } from "@/components/Brand";
import { MarginChart } from "@/components/MarginChart";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { AskAssistant } from "@/components/assistant/AskAssistant";
import { SectionHeader } from "@/components/ui";
import { regionLabel } from "@/lib/geo";
import { formatPrice, unitLabel } from "@/lib/utils";

export function SiteDetail({
  snapshot,
  priceHistory,
}: {
  snapshot: SiteSnapshot;
  priceHistory?: PriceHistory | null;
}) {
  const router = useRouter();
  void router;
  const { site, grades, costs, competitors, demand, latestRecommendations } = snapshot;

  return (
    <div className="space-y-6">
      <Link
        href="/sites"
        className="inline-flex items-center gap-1 text-sm text-eg-ink-soft hover:text-eg-navy"
      >
        <ArrowLeft size={15} /> Sites
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-eg-ink">{site.name}</h1>
            <BrandBadge brand={site.brand} />
          </div>
          <p className="text-sm text-eg-ink-soft">
            {regionLabel(site.country, site.region)}, {site.country} · pricing in{" "}
            {site.currency} per {site.unit}
          </p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-5">
        {/* Left: data */}
        <div className="space-y-4 lg:col-span-3">
        <div className="grid gap-4 sm:grid-cols-2">
        {/* Per-grade snapshot table */}
        <div className="card overflow-hidden">
          <div className="border-b border-eg-line px-4 py-3 text-sm font-semibold text-eg-ink">
            Cost, demand & competition
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-eg-ink-soft">
              <tr className="border-b border-eg-line">
                <th className="px-4 py-2">Grade</th>
                <th className="px-4 py-2">Unit cost</th>
                <th className="px-4 py-2">Comp. avg</th>
                <th className="px-4 py-2">Volume/day</th>
                <th className="px-4 py-2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => {
                const c = costs.find((x) => x.gradeId === g.gradeId);
                const unitCost = c ? c.wholesaleCost + c.deliveryCost : null;
                const comps = competitors
                  .filter((x) => x.gradeId === g.gradeId)
                  .map((x) => x.price);
                const compAvg = comps.length
                  ? comps.reduce((a, b) => a + b, 0) / comps.length
                  : null;
                const d = demand.find((x) => x.gradeId === g.gradeId);
                return (
                  <tr key={g.gradeId} className="border-b border-eg-line last:border-0">
                    <td className="px-4 py-2 font-medium">{g.label}</td>
                    <td className="kpi-num px-4 py-2">
                      {formatPrice(unitCost, site.currency)}
                    </td>
                    <td className="kpi-num px-4 py-2">
                      {formatPrice(compAvg, site.currency)}
                    </td>
                    <td className="kpi-num px-4 py-2">{d?.avgDailyVolume ?? "—"}</td>
                    <td className="px-4 py-2 capitalize text-eg-ink-soft">
                      {d?.trend ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Competitor detail */}
        <div className="card overflow-hidden">
          <div className="border-b border-eg-line px-4 py-3 text-sm font-semibold text-eg-ink">
            Nearby competitors (regular)
          </div>
          <div className="divide-y divide-eg-line">
            {competitors
              .filter((c) => c.gradeId === "regular")
              .map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="text-eg-ink">{c.competitorName}</span>
                  <span className="kpi-num font-medium">
                    {formatPrice(c.price, site.currency)}
                    <span className="text-xs text-eg-ink-soft">
                      {unitLabel(site.country)}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Price history vs competitors */}
      {priceHistory && priceHistory.days.length > 1 && (
        <div className="card overflow-hidden">
          <div className="border-b border-eg-line px-4 py-3 text-sm font-semibold text-eg-ink">
            Price history (regular)
          </div>
          <div className="px-4 py-4">
            <PriceHistoryChart history={priceHistory} />
          </div>
        </div>
      )}

      {/* Recommendation history */}
      <div className="card overflow-hidden">
        <div className="border-b border-eg-line px-4 py-3 text-sm font-semibold text-eg-ink">
          Recommendation history
        </div>
        {latestRecommendations.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-eg-ink-soft">
            No recommendations yet. Run the agents from the assistant on the right.
          </p>
        ) : (
          <>
            <div className="px-4 pt-4">
              <MarginChart recommendations={latestRecommendations} currency={site.currency} />
            </div>
            <div className="divide-y divide-eg-line">
              {latestRecommendations.map((r) => (
                <div key={r.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{r.gradeId}</span>
                    <span className="kpi-num font-semibold text-eg-navy">
                      {formatPrice(r.recommendedPrice, site.currency)}
                      {unitLabel(site.country)}
                    </span>
                  </div>
                  <div className="text-xs text-eg-ink-soft">{r.rationale}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
        </div>

        {/* Right: site assistant (runs the pricing agents inline) — fills the
            viewport height and stays in view while the left column scrolls. */}
        <div className="lg:col-span-2 lg:sticky lg:top-28 flex flex-col gap-3 lg:h-[calc(100vh-9rem)]">
          <SectionHeader
            eyebrow="Pricing agents"
            title="Ask about this site"
            description="Ask a question or say “optimise the regular price” to convene the agents."
          />
          <div className="min-h-0 flex-1">
            <AskAssistant sites={[site]} focusSite={site} fill />
          </div>
        </div>
      </div>
    </div>
  );
}
