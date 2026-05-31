"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { GradeId, PriceHistory, SiteSnapshot } from "@/lib/types";
import { BrandBadge } from "@/components/Brand";
import { MarginChart } from "@/components/MarginChart";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { ElasticityChart } from "@/components/ElasticityChart";
import { AskAssistant } from "@/components/assistant/AskAssistant";
import { SectionHeader } from "@/components/ui";
import { ChangeFlash } from "@/components/ChangeFlash";
import { PriceEditor } from "@/components/PriceEditor";
import { regionLabel } from "@/lib/geo";
import { useSim } from "@/lib/sim/provider";
import {
  cn,
  formatPrice,
  formatRelativeTime,
  formatSimAge,
  formatTimestamp,
  unitLabel,
} from "@/lib/utils";

export function SiteDetail({
  snapshot,
  priceHistories,
}: {
  snapshot: SiteSnapshot;
  priceHistories?: Partial<Record<GradeId, PriceHistory>>;
}) {
  const { site, grades, costs, competitors, demand, latestRecommendations } = snapshot;
  const sim = useSim();
  const currentSimDay = sim.state?.dayIndex ?? null;

  // `latestRecommendations` is newest-first, so the first time a grade appears
  // it is the live recommendation for that grade. Track those ids so we can
  // badge them as "Current" and distinguish them from superseded history.
  const currentRecIds = new Set<number>();
  {
    const seen = new Set<string>();
    for (const r of latestRecommendations) {
      if (!seen.has(r.gradeId)) {
        seen.add(r.gradeId);
        currentRecIds.add(r.id);
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — stays put; the columns below own the remaining height. */}
      <div className="shrink-0 space-y-3 pb-4">
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
      </div>

      {/* On large screens: fill the viewport, scroll ONLY the left column while
          the assistant on the right stays pinned with its input always in view.
          On small screens it falls back to normal page flow. */}
      <div className="grid items-start gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-5">
        {/* Left: data — the sole scroll area on large screens. */}
        <div className="eg-scroll space-y-4 lg:col-span-3 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:pb-4">
        {/* Manual price control + apply agent recommendation. */}
        <PriceEditor snapshot={snapshot} />

        <div className="grid gap-4 xl:grid-cols-5">
        {/* Per-grade snapshot table — wider so all columns fit without scroll. */}
        <div className="card overflow-hidden xl:col-span-3">
          <div className="border-b border-eg-line px-4 py-3 text-sm font-semibold text-eg-ink">
            Cost, demand & competition
          </div>
          <div className="eg-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-eg-ink-soft">
              <tr className="border-b border-eg-line">
                <th className="px-3 py-2">Grade</th>
                <th className="px-3 py-2 text-right">Unit cost</th>
                <th className="px-3 py-2 text-right">Comp. avg</th>
                <th className="px-3 py-2 text-right">Vol/day</th>
                <th className="px-3 py-2">Trend</th>
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
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{g.label}</td>
                    <td className="kpi-num px-3 py-2 text-right">
                      <ChangeFlash
                        value={formatPrice(unitCost, site.currency)}
                        numeric={unitCost}
                        invert
                        className="inline-block px-1"
                      >
                        {formatPrice(unitCost, site.currency)}
                      </ChangeFlash>
                    </td>
                    <td className="kpi-num px-3 py-2 text-right">
                      <ChangeFlash
                        value={formatPrice(compAvg, site.currency)}
                        numeric={compAvg}
                        className="inline-block px-1"
                      >
                        {formatPrice(compAvg, site.currency)}
                      </ChangeFlash>
                    </td>
                    <td className="kpi-num px-3 py-2 text-right">
                      <ChangeFlash
                        value={d?.avgDailyVolume ?? "—"}
                        numeric={d?.avgDailyVolume ?? null}
                        className="inline-block px-1"
                      >
                        {d?.avgDailyVolume ?? "—"}
                      </ChangeFlash>
                    </td>
                    <td className="px-3 py-2 capitalize text-eg-ink-soft">
                      {d?.trend ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>

        {/* Competitor detail */}
        <div className="card overflow-hidden xl:col-span-2">
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
                  <ChangeFlash
                    value={formatPrice(c.price, site.currency)}
                    numeric={c.price}
                    className="kpi-num inline-block px-1 font-medium"
                  >
                    {formatPrice(c.price, site.currency)}
                    <span className="text-xs text-eg-ink-soft">
                      {unitLabel(site.country)}
                    </span>
                  </ChangeFlash>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Price history vs competitors (switchable by grade) */}
      {priceHistories && Object.keys(priceHistories).length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-eg-line px-4 py-3 text-sm font-semibold text-eg-ink">
            Price history
          </div>
          <div className="px-4 py-4">
            <PriceHistoryChart histories={priceHistories} grades={grades} />
          </div>
        </div>
      )}

      {/* Elasticity & price response */}
      {demand.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-eg-line px-4 py-3 text-sm font-semibold text-eg-ink">
            Demand elasticity &amp; price response
          </div>
          <div className="px-4 py-4">
            <ElasticityChart
              site={site}
              grades={grades}
              costs={costs}
              competitors={competitors}
              demand={demand}
              recommendations={latestRecommendations}
              egPrices={snapshot.egPrices}
            />
          </div>
        </div>
      )}

      {/* Recommendation history */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-eg-line px-4 py-3">
          <span className="text-sm font-semibold text-eg-ink">
            Recommendation history
          </span>
          {latestRecommendations.length > 0 && (
            <span className="flex items-center gap-3 text-[11px] text-eg-ink-soft">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-eg-red" />
                Current
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-eg-navy/45" />
                Superseded
              </span>
            </span>
          )}
        </div>
        {latestRecommendations.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-eg-ink-soft">
            No recommendations yet. Run the agents from the assistant on the right.
          </p>
        ) : (
          <>
            <p className="px-4 pt-3 text-xs text-eg-ink-soft">
              Newest first · bar height is projected daily margin, oldest → newest
              left to right.
            </p>
            <div className="px-4 pt-2">
              <MarginChart
                recommendations={latestRecommendations}
                currency={site.currency}
                currentRecIds={currentRecIds}
              />
            </div>
            <div className="divide-y divide-eg-line">
              {latestRecommendations.map((r) => {
                const isCurrent = currentRecIds.has(r.id);
                return (
                  <div
                    key={r.id}
                    className={cn("px-4 py-2.5 text-sm", !isCurrent && "opacity-70")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span className="font-medium capitalize">{r.gradeId}</span>
                        {isCurrent ? (
                          <span className="rounded-full bg-eg-navy/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-eg-navy">
                            Current
                          </span>
                        ) : (
                          <span className="rounded-full bg-eg-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-eg-ink-soft">
                            Superseded
                          </span>
                        )}
                        <span
                          className="text-xs text-eg-ink-soft"
                          title={formatTimestamp(r.createdAt)}
                        >
                          {formatSimAge(r.simDayIndex, currentSimDay) ??
                            formatRelativeTime(r.createdAt)}
                        </span>
                      </span>
                      <span className="kpi-num font-semibold text-eg-navy">
                        {formatPrice(r.recommendedPrice, site.currency)}
                        {unitLabel(site.country)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-eg-ink-soft">{r.rationale}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
        </div>

        {/* Right: site assistant (runs the pricing agents inline) — fills the
            column height; its input stays in view while the left side scrolls. */}
        <div className="flex flex-col gap-3 lg:col-span-2 lg:h-full lg:min-h-0">
          <SectionHeader
            eyebrow="Pricing agents"
            title="Ask about this site"
            description="Ask a question or say “optimise the regular price” to convene the agents."
          />
          <div className="min-h-0 flex-1">
            <AskAssistant
              sites={[site]}
              focusSite={site}
              fill
              persistKey={`site:${site.siteId}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
