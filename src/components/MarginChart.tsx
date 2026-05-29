"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PriceRecommendation } from "@/lib/types";
import { formatPrice } from "@/lib/utils";

/** Projected daily margin per recommendation (most recent first -> chrono order). */
export function MarginChart({
  recommendations,
  currency,
}: {
  recommendations: PriceRecommendation[];
  currency: string;
}) {
  const data = [...recommendations]
    .reverse()
    .filter((r) => r.projectedMargin != null)
    .map((r, i) => ({
      name: `#${i + 1} ${r.gradeId}`,
      margin: r.projectedMargin as number,
      price: r.recommendedPrice,
    }));

  if (data.length === 0) return null;

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--eg-line)" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--eg-ink-soft)" }} />
          <YAxis tick={{ fontSize: 11, fill: "var(--eg-ink-soft)" }} width={48} />
          <Tooltip
            formatter={(v) => [formatPrice(Number(v), currency), "Proj. daily margin"]}
            contentStyle={{
              background: "var(--eg-surface-raised)",
              border: "1px solid var(--eg-line)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="margin" fill="var(--eg-navy)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
