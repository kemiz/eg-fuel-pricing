"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme, tooltipStyle } from "@/lib/chart-theme";
import type { Cost, CompetitorPrice, DemandSignal, FuelGrade, GradeId, PriceRecommendation, Site } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Row {
  price: number;
  volume: number;
  margin: number;
}

/**
 * Price → demand response, driven by the seeded per-grade elasticity:
 *   %volume change = %price change × elasticity   (elasticity is negative)
 * Plots projected daily volume and daily margin as price sweeps around the
 * current pump price, with markers for the current price, the competitor
 * average, and the margin-maximising price.
 */
export function ElasticityChart({
  site,
  grades,
  costs,
  competitors,
  demand,
  recommendations,
  egPrices,
}: {
  site: Site;
  grades: FuelGrade[];
  costs: Cost[];
  competitors: CompetitorPrice[];
  demand: DemandSignal[];
  recommendations: PriceRecommendation[];
  /** Current EG pump price per grade (live/simulated) — the curve's anchor. */
  egPrices?: Partial<Record<GradeId, number>>;
}) {
  const t = useChartTheme();

  // Only grades that actually have demand + cost data are chartable.
  const usable = grades.filter(
    (g) =>
      demand.some((d) => d.gradeId === g.gradeId) &&
      costs.some((c) => c.gradeId === g.gradeId)
  );
  const [grade, setGrade] = useState<GradeId>(usable[0]?.gradeId ?? "regular");

  const symbol = site.currency === "USD" ? "$" : "£";
  const dp = site.currency === "GBP" ? 3 : 2;
  const fmtP = (v: number) => `${symbol}${v.toFixed(dp)}`;
  const fmtN = (v: number) => Math.round(v).toLocaleString();

  const model = useMemo(() => {
    const d = demand.find((x) => x.gradeId === grade);
    const c = costs.find((x) => x.gradeId === grade);
    if (!d || !c) return null;

    const unitCost = c.wholesaleCost + c.deliveryCost;
    const elasticity = d.elasticity; // negative
    const volume0 = d.avgDailyVolume;

    const comps = competitors
      .filter((x) => x.gradeId === grade)
      .map((x) => x.price);
    const compAvg = comps.length
      ? comps.reduce((a, b) => a + b, 0) / comps.length
      : null;

    // Current price anchor: the live EG pump price for the grade, else the
    // latest recommendation, else a sensible reference (cost + typical margin)
    // so the curve is always anchored. This matches the volume the agents
    // project, so the chart's "now" point and the recommendation card agree.
    const rec = recommendations.find((r) => r.gradeId === grade);
    const price0 =
      egPrices?.[grade] ??
      rec?.recommendedPrice ??
      Number((unitCost + (site.country === "US" ? 0.4 : 0.15)).toFixed(dp));

    // Sweep ±14% around the current price.
    const lo = price0 * 0.86;
    const hi = price0 * 1.14;
    const steps = 41;
    const rows: Row[] = [];
    let best: { price: number; margin: number } | null = null;
    for (let i = 0; i < steps; i++) {
      const price = lo + ((hi - lo) * i) / (steps - 1);
      const pctPrice = ((price - price0) / price0) * 100;
      const pctVol = pctPrice * elasticity;
      const volume = Math.max(0, volume0 * (1 + pctVol / 100));
      const margin = (price - unitCost) * volume;
      rows.push({
        price: Number(price.toFixed(dp)),
        volume: Number(volume.toFixed(0)),
        margin: Number(margin.toFixed(0)),
      });
      if (price > unitCost && (!best || margin > best.margin)) {
        best = { price: Number(price.toFixed(dp)), margin };
      }
    }

    return { unitCost, elasticity, volume0, price0, compAvg, rows, best };
  }, [grade, demand, costs, competitors, recommendations, egPrices, site.country, dp]);

  if (!model) {
    return (
      <p className="px-1 py-4 text-sm text-eg-ink-soft">
        No demand or cost data for this grade.
      </p>
    );
  }

  const { elasticity, volume0, price0, compAvg, rows, best } = model;

  // Elasticity strength descriptor for the caption.
  const mag = Math.abs(elasticity);
  const sensitivity = mag >= 1.6 ? "highly elastic" : mag >= 1.0 ? "elastic" : "relatively inelastic";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-eg-ink-soft">
          How daily volume &amp; margin respond as price moves — driven by demand elasticity
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-eg-line p-0.5">
          {usable.map((g) => (
            <button
              key={g.gradeId}
              type="button"
              onClick={() => setGrade(g.gradeId)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                grade === g.gradeId
                  ? "bg-eg-navy text-white"
                  : "text-eg-ink-soft hover:text-eg-ink"
              )}
            >
              {g.gradeId}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="text-eg-ink-soft">
          Elasticity{" "}
          <span className="font-semibold text-eg-ink">{elasticity.toFixed(2)}</span>{" "}
          <span className="text-eg-ink-soft">({sensitivity})</span>
        </span>
        <span className="text-eg-ink-soft">
          Current <span className="font-semibold text-eg-ink">{fmtP(price0)}</span> ·{" "}
          {fmtN(volume0)} {site.unit}/day
        </span>
        {best && (
          <span className="text-eg-ink-soft">
            Margin-max price{" "}
            <span className="font-semibold text-eg-green-600">{fmtP(best.price)}</span>
          </span>
        )}
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ left: 4, right: 8, top: 6 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis
              dataKey="price"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 11, fill: t.axis }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmtP(Number(v))}
              minTickGap={28}
            />
            <YAxis
              yAxisId="vol"
              tick={{ fontSize: 11, fill: t.axis }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v) => `${(Number(v) / 1000).toFixed(1)}k`}
            />
            <YAxis
              yAxisId="margin"
              orientation="right"
              tick={{ fontSize: 11, fill: t.axis }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v) => `${symbol}${(Number(v) / 1000).toFixed(1)}k`}
            />
            <Tooltip
              contentStyle={tooltipStyle(t)}
              labelFormatter={(v) => `Price ${fmtP(Number(v))}`}
              formatter={(v, name) =>
                name === "Daily volume"
                  ? [`${fmtN(Number(v))} ${site.unit}`, name]
                  : [`${symbol}${fmtN(Number(v))}`, name as string]
              }
            />

            {/* Current price reference. */}
            <ReferenceLine
              yAxisId="vol"
              x={price0}
              stroke={t.axis}
              strokeDasharray="4 3"
              label={{ value: "now", position: "top", fontSize: 10, fill: t.axis }}
            />
            {/* Competitor average reference. */}
            {compAvg != null && (
              <ReferenceLine
                yAxisId="vol"
                x={Number(compAvg.toFixed(dp))}
                stroke={t.red}
                strokeDasharray="2 2"
                label={{ value: "rivals", position: "top", fontSize: 10, fill: t.red }}
              />
            )}

            <Line
              yAxisId="vol"
              type="monotone"
              dataKey="volume"
              name="Daily volume"
              stroke={t.navy}
              strokeWidth={2.4}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="margin"
              type="monotone"
              dataKey="margin"
              name="Daily margin"
              stroke={t.green}
              strokeWidth={2.4}
              dot={false}
              isAnimationActive={false}
            />

            {/* Margin-maximising price marker. */}
            {best && (
              <ReferenceDot
                yAxisId="margin"
                x={best.price}
                y={best.margin}
                r={4}
                fill={t.green}
                stroke="#fff"
                strokeWidth={1.5}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: t.navy }} />
          <span className="text-eg-ink-soft">Daily volume</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: t.green }} />
          <span className="text-eg-ink-soft">Daily margin</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: t.axis }} />
          <span className="text-eg-ink-soft">Current price</span>
        </span>
        {compAvg != null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t-2 border-dotted" style={{ borderColor: t.red }} />
            <span className="text-eg-ink-soft">Competitor avg</span>
          </span>
        )}
      </div>
    </div>
  );
}
