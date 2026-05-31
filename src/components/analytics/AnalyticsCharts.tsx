"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { useChartTheme, tooltipStyle } from "@/lib/chart-theme";
import type {
  BrandPerf,
  ElasticityPoint,
  MarginBucket,
  RegionPerf,
  TrendPoint,
} from "@/lib/data/server";
import { currencySymbol, formatCompactMoney, formatCompactNumber } from "@/lib/utils";

const fmtDay = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/* -------------------------------------------------------------------------- */
/*  Margin pool trend (area)                                                   */
/* -------------------------------------------------------------------------- */

export function MarginPoolTrend({
  data,
  currency,
}: {
  data: TrendPoint[];
  currency: string;
}) {
  const t = useChartTheme();
  const tickEvery = data.length > 45 ? 9 : data.length > 20 ? 5 : 2;
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 4, right: 12, top: 6 }}>
          <defs>
            <linearGradient id="poolFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t.green} stopOpacity={0.45} />
              <stop offset="100%" stopColor={t.green} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            interval={tickEvery}
            minTickGap={20}
            tickFormatter={fmtDay}
          />
          <YAxis
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v) => formatCompactMoney(Number(v), currency)}
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
            formatter={(v) => [formatCompactMoney(Number(v), currency) + "/day", "Margin pool"]}
          />
          <Area
            type="monotone"
            dataKey="marginPool"
            stroke={t.green}
            strokeWidth={2.6}
            fill="url(#poolFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Price vs competitor + margin (composed, dual axis)                         */
/* -------------------------------------------------------------------------- */

export function PriceVsCompTrend({
  data,
  currency,
  unit,
}: {
  data: TrendPoint[];
  currency: string;
  unit: string;
}) {
  const t = useChartTheme();
  const symbol = currencySymbol(currency);
  const dp = currency === "GBP" ? 3 : 2;
  const fmt = (v: number) => `${symbol}${v.toFixed(dp)}`;
  const tickEvery = data.length > 45 ? 9 : data.length > 20 ? 5 : 2;
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 4, right: 8, top: 6 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            interval={tickEvery}
            minTickGap={20}
            tickFormatter={fmtDay}
          />
          <YAxis
            yAxisId="price"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={["auto", "auto"]}
            tickFormatter={(v) => fmt(Number(v))}
          />
          <YAxis
            yAxisId="margin"
            orientation="right"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            width={52}
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
          <Line
            yAxisId="margin"
            type="monotone"
            dataKey="margin"
            name={`Margin${unit}`}
            stroke={t.green}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="compPrice"
            name="Competitor avg"
            stroke={t.axis}
            strokeWidth={1.6}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="egPrice"
            name="EG price"
            stroke={t.navy}
            strokeWidth={2.6}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { color: t.navy, label: "EG price", kind: "line" },
          { color: t.axis, label: "Competitor avg", kind: "line" },
          { color: t.green, label: `Per-unit margin${unit}`, kind: "dash" },
        ]}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Positioning donut                                                          */
/* -------------------------------------------------------------------------- */

export function PositioningDonut({
  data,
  total,
}: {
  data: { label: string; value: number }[];
  total: number;
}) {
  const t = useChartTheme();
  const colors: Record<string, string> = {
    Cheaper: t.green,
    "In line": t.amber,
    Dearer: t.red,
  };
  return (
    <div className="relative h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.label} fill={colors[d.label] ?? t.navy} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle(t)}
            formatter={(v, name) => [`${v} sites`, name as string]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="kpi-num text-3xl font-bold text-eg-ink">{total}</span>
        <span className="text-[11px] uppercase tracking-wide text-eg-ink-soft">sites</span>
      </div>
      <div className="-mt-2 flex justify-center gap-4 text-xs">
        {data.map((d) => (
          <span key={d.label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: colors[d.label] ?? t.navy }}
            />
            <span className="text-eg-ink-soft">{d.label}</span>
            <span className="font-semibold text-eg-ink">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Region margin pool (horizontal bars)                                       */
/* -------------------------------------------------------------------------- */

export function RegionMarginPoolChart({
  data,
  currency,
}: {
  data: RegionPerf[];
  currency: string;
}) {
  const t = useChartTheme();
  const rows = data.slice(0, 10);
  const height = Math.max(220, rows.length * 30);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke={t.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatCompactMoney(Number(v), currency)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: t.navySoft }}
            contentStyle={tooltipStyle(t)}
            formatter={(v, _n, p) => [
              `${formatCompactMoney(Number(v), currency)}/day · ${p.payload.sites} sites`,
              "Margin pool",
            ]}
          />
          <Bar dataKey="marginPool" radius={[0, 5, 5, 0]} barSize={16}>
            {rows.map((r) => (
              <Cell key={r.region} fill={r.delta > 0 ? t.amber : t.navy} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Brand margin (vertical bars)                                               */
/* -------------------------------------------------------------------------- */

export function BrandMarginChart({
  data,
  currency,
  unit,
}: {
  data: BrandPerf[];
  currency: string;
  unit: string;
}) {
  const t = useChartTheme();
  const symbol = currencySymbol(currency);
  const dp = currency === "GBP" ? 3 : 2;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -8, right: 8, top: 4 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="brand"
            tick={{ fontSize: 10, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={data.length > 4 ? -18 : 0}
            textAnchor={data.length > 4 ? "end" : "middle"}
            height={data.length > 4 ? 50 : 30}
          />
          <YAxis
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={(v) => `${symbol}${Number(v).toFixed(dp)}`}
          />
          <Tooltip
            cursor={{ fill: t.navySoft }}
            contentStyle={tooltipStyle(t)}
            formatter={(v, _n, p) => [
              `${symbol}${Number(v).toFixed(dp)}${unit} · ${formatCompactMoney(
                p.payload.marginPool,
                currency
              )}/day · ${p.payload.sites} sites`,
              "Avg margin",
            ]}
          />
          <Bar dataKey="avgMargin" radius={[5, 5, 0, 0]} barSize={34}>
            {data.map((d) => (
              <Cell key={d.brand} fill={t.navy} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Margin distribution histogram                                              */
/* -------------------------------------------------------------------------- */

export function MarginDistribution({ data }: { data: MarginBucket[] }) {
  const t = useChartTheme();
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 8, top: 4 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: t.navySoft }}
            contentStyle={tooltipStyle(t)}
            formatter={(v) => [`${v} sites`, "Count"]}
            labelFormatter={(l) => `Margin from ${l}`}
          />
          <Bar dataKey="count" radius={[5, 5, 0, 0]}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={
                  i < data.length / 3
                    ? t.red
                    : i < (2 * data.length) / 3
                      ? t.amber
                      : t.green
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Elasticity vs margin scatter                                               */
/* -------------------------------------------------------------------------- */

export function ElasticityScatter({
  data,
  currency,
  unit,
}: {
  data: ElasticityPoint[];
  currency: string;
  unit: string;
}) {
  const t = useChartTheme();
  const symbol = currencySymbol(currency);
  const dp = currency === "GBP" ? 3 : 2;
  const band = currency === "USD" ? 0.05 : 0.02;

  // Split by positioning so colour encodes opportunity.
  const cheaper = data.filter((d) => d.delta < -band);
  const inLine = data.filter((d) => d.delta >= -band && d.delta <= band);
  const dearer = data.filter((d) => d.delta > band);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: 4, right: 12, top: 6, bottom: 4 }}>
          <CartesianGrid stroke={t.grid} />
          <XAxis
            type="number"
            dataKey="elasticity"
            name="Elasticity"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => Number(v).toFixed(1)}
            label={{
              value: "more price-sensitive →",
              position: "insideBottom",
              offset: -2,
              fontSize: 10,
              fill: t.axis,
            }}
          />
          <YAxis
            type="number"
            dataKey="margin"
            name="Margin"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={(v) => `${symbol}${Number(v).toFixed(dp)}`}
          />
          <ZAxis type="number" dataKey="volume" range={[30, 320]} name="Volume" />
          <ReferenceLine y={0} stroke={t.axis} strokeDasharray="3 3" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={tooltipStyle(t)}
            formatter={(v, name) => {
              if (name === "Margin") return [`${symbol}${Number(v).toFixed(dp)}${unit}`, name];
              if (name === "Volume") return [formatCompactNumber(Number(v)), name];
              if (name === "Elasticity") return [Number(v).toFixed(2), name];
              return [v, name];
            }}
            labelFormatter={() => ""}
          />
          <Scatter name="Cheaper" data={cheaper} fill={t.green} fillOpacity={0.7} />
          <Scatter name="In line" data={inLine} fill={t.amber} fillOpacity={0.7} />
          <Scatter name="Dearer" data={dearer} fill={t.red} fillOpacity={0.75} />
        </ScatterChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { color: t.green, label: "Cheaper than rivals", kind: "dot" },
          { color: t.amber, label: "In line", kind: "dot" },
          { color: t.red, label: "Dearer than rivals", kind: "dot" },
        ]}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shared legend                                                              */
/* -------------------------------------------------------------------------- */

function Legend({
  items,
}: {
  items: { color: string; label: string; kind: "line" | "dash" | "dot" }[];
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.kind === "dot" ? (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: it.color }}
            />
          ) : it.kind === "dash" ? (
            <span
              className="inline-block h-0 w-4 border-t-2 border-dashed"
              style={{ borderColor: it.color }}
            />
          ) : (
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ background: it.color }}
            />
          )}
          <span className="text-eg-ink-soft">{it.label}</span>
        </span>
      ))}
    </div>
  );
}
