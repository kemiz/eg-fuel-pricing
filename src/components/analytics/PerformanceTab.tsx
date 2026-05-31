"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Hand,
  Minus,
  Sparkles,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  InterventionRow,
  PerfDay,
  PerformanceData,
  PerfTotals,
} from "@/lib/data/server";
import type { Country } from "@/lib/types";
import { Card, Pill, SectionHeader } from "@/components/ui";
import { SimRefreshing } from "@/components/SimRefreshing";
import { ChangeFlash } from "@/components/ChangeFlash";
import { useChartTheme, tooltipStyle } from "@/lib/chart-theme";
import { cn, currencySymbol, formatCompactMoney } from "@/lib/utils";

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * Performance tab — the tracked record of how active pricing is doing. The
 * headline is the cumulative margin pool earned over the tracking period vs a
 * fair "no active pricing" counterfactual: each day, hold EG's STARTING per-unit
 * margin and just pass that day's cost through, against the same local rivals.
 * The gap (which can go either way day to day) is the value active pricing adds.
 * Below, every applied price change is logged with its realized per-unit-margin
 * impact so you can see whether the recommendations and changes executed well.
 */
/** Rolling window options for the trend charts (in days). null = whole run. */
const WINDOWS: { id: string; label: string; days: number | null }[] = [
  { id: "7", label: "7D", days: 7 },
  { id: "30", label: "30D", days: 30 },
  { id: "90", label: "90D", days: 90 },
  { id: "all", label: "All", days: null },
];

const winLabel = (w: { days: number | null }) =>
  w.days == null ? " · full run" : ` · last ${w.days} days`;

export function PerformanceTab({ performance }: { performance: PerformanceData }) {
  const [country, setCountry] = useState<Country>("US");
  const [windowId, setWindowId] = useState<string>("30");
  const active =
    performance.countries.find((c) => c.country === country) ??
    performance.countries[0];

  const hasRun = performance.dayIndex > 0 && active.trend.length > 0;

  // Slice the trend to the selected rolling window (most recent N days). The
  // cumulative chart then re-bases its running total to the window start, so
  // the charts show a fixed window of recent activity instead of an ever-
  // growing stack since day 0.
  const win = WINDOWS.find((w) => w.id === windowId) ?? WINDOWS[1];
  const windowedTrend = useMemo(() => {
    if (win.days == null || active.trend.length <= win.days) return active.trend;
    return active.trend.slice(-win.days);
  }, [active.trend, win.days]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl border border-eg-line bg-eg-surface/60 p-1 backdrop-blur">
          {performance.countries.map((c) => (
            <button
              key={c.country}
              type="button"
              onClick={() => setCountry(c.country)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                active.country === c.country
                  ? "bg-eg-navy text-white shadow-sm"
                  : "text-eg-ink-soft hover:text-eg-ink"
              )}
            >
              {c.country === "US" ? "United States" : "United Kingdom"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {hasRun && (
            <div className="inline-flex items-center gap-1 rounded-xl border border-eg-line bg-eg-surface/60 p-1 backdrop-blur">
              {WINDOWS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWindowId(w.id)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                    windowId === w.id
                      ? "bg-eg-navy text-white shadow-sm"
                      : "text-eg-ink-soft hover:text-eg-ink"
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          )}
          <span className="hidden text-xs text-eg-ink-soft sm:inline">
            Tracking period · {active.totals.days}{" "}
            {active.totals.days === 1 ? "day" : "days"} · regular grade
          </span>
        </div>
      </div>

      {!hasRun ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Sparkles size={22} className="text-eg-navy" />
            <p className="text-sm font-medium text-eg-ink">
              No performance to track yet
            </p>
            <p className="max-w-md text-sm text-eg-ink-soft">
              As days roll forward, each one is recorded here so you can see the
              cumulative margin pool, the uplift from active pricing vs simply
              passing cost through at the starting margin, and how your applied
              recommendations actually performed.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <SimRefreshing>
            <PerfKpis totals={active.totals} currency={active.currency} unit={active.unit} />
          </SimRefreshing>

          <Card>
            <SectionHeader
              eyebrow="Cumulative"
              title={`Margin pool earned vs no active pricing${winLabel(win)}`}
              description="Running total of daily fuel margin over the selected window. The dashed line is the counterfactual — what the network would have earned simply passing each day's cost through at its starting margin. The gap is the uplift from active pricing."
            />
            <SimRefreshing className="mt-4">
              <CumulativeUpliftChart trend={windowedTrend} currency={active.currency} />
            </SimRefreshing>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <SectionHeader
                eyebrow="Daily"
                title="Daily uplift vs no active pricing"
                description="Per-day margin pool above (green) or below (red) the cost-pass-through counterfactual. Expect a mix — some days the simpler policy wins."
              />
              <SimRefreshing className="mt-4">
                <DailyUpliftChart trend={windowedTrend} currency={active.currency} />
              </SimRefreshing>
            </Card>
            <Card>
              <SectionHeader
                eyebrow="Throughput"
                title="Daily volume & avg per-unit margin"
                description="How fuel volume and the per-unit margin have moved over the window."
              />
              <SimRefreshing className="mt-4">
                <VolumeMarginChart trend={windowedTrend} currency={active.currency} unit={active.unit} />
              </SimRefreshing>
            </Card>
          </div>

          <InterventionsCard
            interventions={performance.interventions.filter((i) => i.country === country)}
            currency={active.currency}
            unit={active.unit}
          />
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  KPI row                                                                    */
/* -------------------------------------------------------------------------- */

function PerfKpis({
  totals,
  currency,
  unit,
}: {
  totals: PerfTotals;
  currency: string;
  unit: string;
}) {
  const dp = currency === "GBP" ? 3 : 2;
  const symbol = currencySymbol(currency);
  const upliftPositive = totals.cumUplift >= 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <PerfKpi
        icon={Banknote}
        label="Cumulative margin pool"
        value={formatCompactMoney(totals.cumMarginPool, currency)}
        sub={`over ${totals.days} ${totals.days === 1 ? "day" : "days"}`}
        tone="navy"
      />
      <PerfKpi
        icon={upliftPositive ? TrendingUp : ArrowDownRight}
        label="Uplift vs baseline"
        value={`${upliftPositive ? "+" : "−"}${formatCompactMoney(
          Math.abs(totals.cumUplift),
          currency
        )}`}
        sub={
          totals.upliftPct != null
            ? `${upliftPositive ? "+" : "−"}${Math.abs(totals.upliftPct).toFixed(1)}% vs flat prices`
            : "vs flat prices"
        }
        tone={upliftPositive ? "green" : "red"}
      />
      <PerfKpi
        icon={Banknote}
        label="Cumulative revenue"
        value={formatCompactMoney(totals.cumRevenue, currency)}
        sub="fuel sales"
        tone="navy"
      />
      <PerfKpi
        icon={TrendingUp}
        label="Avg per-unit margin"
        value={`${symbol}${totals.avgMargin.toFixed(dp)}`}
        sub={`per ${unit} · run average`}
        tone="green"
        footer={
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill tone="good">{totals.cheaper} cheaper</Pill>
            <Pill tone="watch">{totals.inLine} in line</Pill>
            <Pill tone="bad">{totals.dearer} dearer</Pill>
          </div>
        }
      />
    </div>
  );
}

function PerfKpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  footer,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone: "navy" | "green" | "red";
  footer?: React.ReactNode;
}) {
  const toneText =
    tone === "green" ? "text-eg-green-600" : tone === "red" ? "text-eg-red" : "text-eg-navy";
  return (
    <div className="eg-tile flex flex-col p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-eg-ink-soft">
          {label}
        </span>
        <Icon size={15} className={toneText} />
      </div>
      <ChangeFlash value={value} className={cn("kpi-num mt-1.5 text-2xl font-bold", toneText)}>
        {value}
      </ChangeFlash>
      {sub && <span className="mt-1 text-xs text-eg-ink-soft">{sub}</span>}
      {footer}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Charts                                                                     */
/* -------------------------------------------------------------------------- */

/** Cumulative actual margin pool (area) vs counterfactual (dashed line). */
function CumulativeUpliftChart({
  trend,
  currency,
}: {
  trend: PerfDay[];
  currency: string;
}) {
  const t = useChartTheme();
  const data = useMemo(() => {
    let act = 0;
    let cf = 0;
    return trend.map((d) => {
      act += d.marginPool;
      cf += d.cfMarginPool;
      return { day: d.day, dayIndex: d.dayIndex, actual: act, counterfactual: cf };
    });
  }, [trend]);
  const tickEvery = data.length > 45 ? 9 : data.length > 20 ? 5 : 2;

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 4, right: 12, top: 6 }}>
          <defs>
            <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.navy} stopOpacity={0.4} />
              <stop offset="100%" stopColor={t.navy} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtDay}
            interval={tickEvery}
          />
          <YAxis
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={(v) => formatCompactMoney(Number(v), currency)}
          />
          <Tooltip
            contentStyle={tooltipStyle(t)}
            labelFormatter={(v) => fmtDay(String(v))}
            formatter={(v, name) => [formatCompactMoney(Number(v), currency), name as string]}
          />
          <Area
            type="monotone"
            dataKey="actual"
            name="With active pricing"
            stroke={t.navy}
            strokeWidth={2.4}
            fill="url(#cumFill)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="counterfactual"
            name="No active pricing"
            stroke={t.axis}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Per-day uplift vs baseline (signed bars). */
function DailyUpliftChart({ trend, currency }: { trend: PerfDay[]; currency: string }) {
  const t = useChartTheme();
  const data = trend.map((d) => ({
    day: d.day,
    uplift: d.upliftMarginPool,
  }));
  const tickEvery = data.length > 45 ? 9 : data.length > 20 ? 5 : 2;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 4, right: 12, top: 6 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtDay}
            interval={tickEvery}
          />
          <YAxis
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={(v) => formatCompactMoney(Number(v), currency)}
          />
          <Tooltip
            contentStyle={tooltipStyle(t)}
            labelFormatter={(v) => fmtDay(String(v))}
            formatter={(v) => [formatCompactMoney(Number(v), currency), "Uplift vs baseline"]}
            cursor={{ fill: t.navySoft }}
          />
          <ReferenceLine y={0} stroke={t.axis} />
          <Bar dataKey="uplift" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.uplift >= 0 ? t.green : t.red} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Daily volume (area) + avg per-unit margin (line, right axis). */
function VolumeMarginChart({
  trend,
  currency,
  unit,
}: {
  trend: PerfDay[];
  currency: string;
  unit: string;
}) {
  const t = useChartTheme();
  const symbol = currencySymbol(currency);
  const dp = currency === "GBP" ? 3 : 2;
  const tickEvery = trend.length > 45 ? 9 : trend.length > 20 ? 5 : 2;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trend} margin={{ left: 4, right: 8, top: 6 }}>
          <defs>
            <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.navy} stopOpacity={0.32} />
              <stop offset="100%" stopColor={t.navy} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtDay}
            interval={tickEvery}
          />
          <YAxis
            yAxisId="vol"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v) => `${(Number(v) / 1000).toFixed(0)}k`}
          />
          <YAxis
            yAxisId="margin"
            orientation="right"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v) => `${symbol}${Number(v).toFixed(dp)}`}
          />
          <Tooltip
            contentStyle={tooltipStyle(t)}
            labelFormatter={(v) => fmtDay(String(v))}
            formatter={(v, name) =>
              name === "Avg margin"
                ? [`${symbol}${Number(v).toFixed(dp)}/${unit}`, name]
                : [`${Math.round(Number(v)).toLocaleString()} ${unit}`, name as string]
            }
          />
          <Area
            yAxisId="vol"
            type="monotone"
            dataKey="volume"
            name="Daily volume"
            stroke={t.navy}
            strokeWidth={2.2}
            fill="url(#volFill)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="margin"
            type="monotone"
            dataKey="avgMargin"
            name="Avg margin"
            stroke={t.green}
            strokeWidth={2.2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Interventions table                                                        */
/* -------------------------------------------------------------------------- */

function InterventionsCard({
  interventions,
  currency,
  unit,
}: {
  interventions: InterventionRow[];
  currency: string;
  unit: string;
}) {
  const dp = currency === "GBP" ? 3 : 2;
  const symbol = currencySymbol(currency);

  const helpedCount = interventions.filter((i) => i.helped === true).length;
  const measured = interventions.filter((i) => i.helped != null).length;

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-eg-line px-5 py-4">
        <SectionHeader
          eyebrow="Interventions"
          title="Applied price changes & their impact"
          description="Every price change you applied (agent recommendation or manual), with the per-unit margin it moved to and the realized change measured in the days after vs before."
        />
        {measured > 0 && (
          <Pill tone={helpedCount >= measured - helpedCount ? "good" : "watch"}>
            {helpedCount}/{measured} improved margin
          </Pill>
        )}
      </div>
      <SimRefreshing>
        {interventions.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-eg-ink-soft">
            No price changes applied yet. Run the agents and click “Apply price”, or
            set a price on a site page — each change is tracked here.
          </div>
        ) : (
          <div className="overflow-x-auto eg-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-eg-ink-soft">
                  <th className="px-5 py-2 font-medium">Site</th>
                  <th className="px-2 py-2 font-medium">Source</th>
                  <th className="px-2 py-2 text-right font-medium">Day</th>
                  <th className="px-2 py-2 text-right font-medium">Price change</th>
                  <th className="px-2 py-2 text-right font-medium">Margin{`/${unit}`}</th>
                  <th className="px-5 py-2 text-right font-medium">Realized impact</th>
                </tr>
              </thead>
              <tbody>
                {interventions.map((i) => (
                  <InterventionRowView
                    key={i.id}
                    i={i}
                    symbol={symbol}
                    dp={dp}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SimRefreshing>
    </Card>
  );
}

function InterventionRowView({
  i,
  symbol,
  dp,
}: {
  i: InterventionRow;
  symbol: string;
  dp: number;
}) {
  const SourceIcon = i.source === "recommendation" || i.source === "agent" ? Sparkles : Hand;
  const sourceLabel =
    i.source === "recommendation" ? "Agent" : i.source === "agent" ? "Agent" : "Manual";

  const priceMove =
    i.priceDelta == null ? null : i.priceDelta > 0 ? "up" : i.priceDelta < 0 ? "down" : "flat";

  // Surface freshness so an apply is obviously reflected: rows applied on the
  // current day are flagged "New" and tinted; the last couple of days get a
  // softer tint. daysSince = current sim day − the day this change landed.
  const isNew = i.daysSince <= 0;
  const isRecent = i.daysSince > 0 && i.daysSince <= 2;

  return (
    <tr
      className={cn(
        "border-t border-eg-line align-top transition-colors hover:bg-eg-surface-2/60",
        isNew && "bg-eg-green/8",
        isRecent && "bg-eg-navy/[0.04]"
      )}
    >
      <td className={cn("px-5 py-3", isNew && "border-l-2 border-l-eg-green")}>
        <Link
          href={`/site/${i.siteId}`}
          className="font-medium text-eg-ink hover:text-eg-navy"
        >
          {i.siteName}
        </Link>
        <div className="text-[11px] text-eg-ink-soft">
          {i.brand} · {i.regionLabel}
        </div>
      </td>
      <td className="px-2 py-3">
        <span className="inline-flex items-center gap-1 text-xs text-eg-ink-soft">
          <SourceIcon size={13} className="text-eg-navy" />
          {sourceLabel}
        </span>
      </td>
      <td className="kpi-num px-2 py-3 text-right text-eg-ink-soft">
        <span className="inline-flex items-center justify-end gap-1.5">
          {isNew && (
            <span className="rounded-full bg-eg-green/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-eg-green-600">
              New
            </span>
          )}
          {i.dayIndex}
        </span>
      </td>
      <td className="kpi-num px-2 py-3 text-right">
        {i.newPrice == null ? (
          "—"
        ) : (
          <span className="inline-flex items-center gap-1">
            {i.oldPrice != null && (
              <span className="text-eg-ink-soft line-through">
                {symbol}
                {i.oldPrice.toFixed(dp)}
              </span>
            )}
            <span className="font-semibold text-eg-ink">
              {symbol}
              {i.newPrice.toFixed(dp)}
            </span>
            {priceMove === "up" && <ArrowUpRight size={13} className="text-eg-red" />}
            {priceMove === "down" && <ArrowDownRight size={13} className="text-eg-green-600" />}
            {priceMove === "flat" && <Minus size={13} className="text-eg-ink-soft" />}
          </span>
        )}
      </td>
      <td className="kpi-num px-2 py-3 text-right font-medium text-eg-navy">
        {i.appliedMargin == null ? "—" : `${symbol}${i.appliedMargin.toFixed(dp)}`}
      </td>
      <td className="px-5 py-3 text-right">
        <RealizedImpact i={i} symbol={symbol} dp={dp} />
      </td>
    </tr>
  );
}

/** The realized per-unit-margin delta, or a "measuring…" state if too recent. */
function RealizedImpact({
  i,
  symbol,
  dp,
}: {
  i: InterventionRow;
  symbol: string;
  dp: number;
}) {
  if (i.realizedMarginDelta == null) {
    return (
      <span className="text-xs text-eg-ink-soft">
        {i.daysSince <= 0 ? "Just applied" : `Measuring · day ${i.daysSince}`}
      </span>
    );
  }
  const positive = i.realizedMarginDelta >= 0;
  const Icon = positive ? CheckCircle2 : XCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-1 text-xs font-medium",
        positive ? "text-eg-green-600" : "text-eg-red"
      )}
      title="Change in per-unit margin: avg of the 7 days after vs before this change"
    >
      <Icon size={13} />
      {positive ? "+" : "−"}
      {symbol}
      {Math.abs(i.realizedMarginDelta).toFixed(dp)} margin
    </span>
  );
}
