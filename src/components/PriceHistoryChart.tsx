"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme, tooltipStyle } from "@/lib/chart-theme";
import type { PriceHistory } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Muted palette for competitor lines (EG always uses the brand red). */
const COMP_COLORS = ["#7c8aa3", "#a9b4c7", "#c2b59b", "#8fa9c9", "#b59bc2"];

type Period = 30 | 60 | 90;

interface Row {
  day: string;
  [series: string]: number | string;
}

export function PriceHistoryChart({ history }: { history: PriceHistory }) {
  const t = useChartTheme();
  const [period, setPeriod] = useState<Period>(90);

  const symbol = history.currency === "USD" ? "$" : "£";
  const dp = history.currency === "GBP" ? 3 : 2;
  const fmt = (v: number) => `${symbol}${v.toFixed(dp)}`;

  const { rows, eg, competitors } = useMemo(() => {
    const days = history.days.slice(-period);
    const allowed = new Set(days);
    const rows: Row[] = days.map((day) => ({ day }));
    const idx = new Map(days.map((d, i) => [d, i]));
    for (const s of history.series) {
      for (const p of s.points) {
        if (!allowed.has(p.day)) continue;
        const i = idx.get(p.day);
        if (i == null) continue;
        if (Number.isFinite(p.price)) rows[i][s.series] = p.price;
      }
    }
    const eg = history.series.find((s) => s.isEg)?.series ?? "EG";
    const competitors = history.series.filter((s) => !s.isEg).map((s) => s.series);
    return { rows, eg, competitors };
  }, [history, period]);

  // Trend summary: EG price change across the window.
  const summary = useMemo(() => {
    const egSeries = history.series.find((s) => s.isEg);
    if (!egSeries) return null;
    const pts = egSeries.points.filter((p) => Number.isFinite(p.price)).slice(-period);
    if (pts.length < 2) return null;
    const first = pts[0].price;
    const last = pts[pts.length - 1].price;
    const change = last - first;
    const pct = first ? (change / first) * 100 : 0;
    // EG vs competitor average right now.
    const compNow = competitors
      .map((c) => history.series.find((s) => s.series === c))
      .map((s) => s?.points.filter((p) => Number.isFinite(p.price)).at(-1)?.price)
      .filter((v): v is number => v != null);
    const compAvg = compNow.length
      ? compNow.reduce((a, b) => a + b, 0) / compNow.length
      : null;
    const vsComp = compAvg == null ? null : last - compAvg;
    return { first, last, change, pct, vsComp };
  }, [history, period, competitors]);

  const tickEvery = period <= 30 ? 4 : period <= 60 ? 6 : 9;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-eg-ink-soft">
          EG vs local competitors · daily pump price
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-eg-line p-0.5">
          {([30, 60, 90] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                period === p
                  ? "bg-eg-navy text-white"
                  : "text-eg-ink-soft hover:text-eg-ink"
              )}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {summary && (
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <span className="text-eg-ink-soft">
            Now <span className="font-semibold text-eg-ink">{fmt(summary.last)}</span>
          </span>
          <span className="text-eg-ink-soft">
            {period}d change{" "}
            <span
              className={cn(
                "font-semibold",
                summary.change > 0
                  ? "text-eg-red"
                  : summary.change < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-eg-ink"
              )}
            >
              {summary.change >= 0 ? "+" : ""}
              {fmt(summary.change)} ({summary.pct >= 0 ? "+" : ""}
              {summary.pct.toFixed(1)}%)
            </span>
          </span>
          {summary.vsComp != null && (
            <span className="text-eg-ink-soft">
              vs rivals{" "}
              <span
                className={cn(
                  "font-semibold",
                  summary.vsComp > 0
                    ? "text-eg-red"
                    : "text-emerald-600 dark:text-emerald-400"
                )}
              >
                {summary.vsComp >= 0 ? "+" : ""}
                {fmt(summary.vsComp)}
              </span>
            </span>
          )}
        </div>
      )}

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: -8, right: 12, top: 4 }}>
            <CartesianGrid stroke={t.grid} vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: t.axis }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
              interval={tickEvery}
              tickFormatter={(d: string) => {
                const dt = new Date(d);
                return dt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: t.axis }}
              axisLine={false}
              tickLine={false}
              width={56}
              domain={["auto", "auto"]}
              tickFormatter={(v) => fmt(Number(v))}
            />
            <Tooltip
              contentStyle={tooltipStyle(t)}
              labelFormatter={(d) =>
                new Date(String(d)).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
              }
              formatter={(v, name) => [fmt(Number(v)), name as string]}
            />
            {competitors.map((c, i) => (
              <Line
                key={c}
                type="monotone"
                dataKey={c}
                stroke={COMP_COLORS[i % COMP_COLORS.length]}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey={eg}
              name="EG"
              stroke={t.red}
              strokeWidth={2.6}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded"
            style={{ background: t.red }}
          />
          <span className="font-medium text-eg-ink">EG</span>
        </span>
        {competitors.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0 w-4 border-t-2 border-dashed"
              style={{ borderColor: COMP_COLORS[i % COMP_COLORS.length] }}
            />
            <span className="text-eg-ink-soft">{c}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
