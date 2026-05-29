"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme, tooltipStyle } from "@/lib/chart-theme";

export interface RegionBar {
  region: string;
  margin: number;
}

/** Top regions by average margin (separate charts per country/unit). */
export function RegionMarginChart({
  data,
  currency,
}: {
  data: RegionBar[];
  currency: string;
}) {
  const t = useChartTheme();
  const symbol = currency === "USD" ? "$" : "£";
  const dp = currency === "GBP" ? 3 : 2;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke={t.grid} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${symbol}${Number(v).toFixed(dp)}`}
          />
          <YAxis
            type="category"
            dataKey="region"
            width={120}
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: t.navySoft }}
            contentStyle={tooltipStyle(t)}
            formatter={(v) => [`${symbol}${Number(v).toFixed(dp)}`, "Avg margin"]}
          />
          <Bar dataKey="margin" radius={[0, 5, 5, 0]} barSize={16}>
            {data.map((_, i) => (
              <Cell key={i} fill={t.navy} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface PositionDatum {
  label: string;
  value: number;
}

/** Network positioning vs rivals (cheaper / in line / dearer). */
export function PositioningChart({ data }: { data: PositionDatum[] }) {
  const t = useChartTheme();
  const colors = [t.green, t.amber, t.red];
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -16, right: 8 }}>
          <CartesianGrid stroke={t.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: t.axis }}
            axisLine={false}
            tickLine={false}
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
            formatter={(v) => [`${v} sites`, ""]}
          />
          <Bar dataKey="value" radius={[5, 5, 0, 0]} barSize={48}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
