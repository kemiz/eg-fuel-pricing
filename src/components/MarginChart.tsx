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
import type { PriceRecommendation } from "@/lib/types";
import { formatPrice, formatRelativeTime, formatTimestamp } from "@/lib/utils";

interface Datum {
  /** Short x-axis label: grade + when it was made (chronological). */
  label: string;
  margin: number;
  price: number;
  gradeId: string;
  when: string;
  whenExact: string;
  current: boolean;
}

/**
 * Projected daily margin per recommendation, in chronological order
 * (oldest -> newest, left -> right). The most recent recommendation per grade
 * is highlighted in EG red; superseded ones are muted navy.
 */
export function MarginChart({
  recommendations,
  currency,
  currentRecIds,
}: {
  recommendations: PriceRecommendation[];
  currency: string;
  /** Ids of the live recommendation per grade, for highlighting. */
  currentRecIds?: Set<number>;
}) {
  const data: Datum[] = [...recommendations]
    .reverse()
    .filter((r) => r.projectedMargin != null)
    .map((r) => {
      const when = formatRelativeTime(r.createdAt);
      return {
        label: `${r.gradeId} · ${when}`,
        margin: r.projectedMargin as number,
        price: r.recommendedPrice,
        gradeId: r.gradeId,
        when,
        whenExact: formatTimestamp(r.createdAt),
        current: currentRecIds?.has(r.id) ?? false,
      };
    });

  if (data.length === 0) return null;

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--eg-line)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "var(--eg-ink-soft)" }}
            interval={0}
          />
          <YAxis tick={{ fontSize: 11, fill: "var(--eg-ink-soft)" }} width={48} />
          <Tooltip
            cursor={{ fill: "var(--eg-line)", opacity: 0.3 }}
            formatter={(v) => [formatPrice(Number(v), currency), "Proj. daily margin"]}
            labelFormatter={(label, payload) => {
              const d = payload?.[0]?.payload as Datum | undefined;
              if (!d) return String(label);
              const tag = d.current ? " (current)" : " (superseded)";
              const stamp = d.whenExact ? ` · ${d.whenExact}` : "";
              return `${d.gradeId}${tag}${stamp}`;
            }}
            contentStyle={{
              background: "var(--eg-surface-raised)",
              border: "1px solid var(--eg-line)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="margin" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.current ? "var(--eg-red)" : "var(--eg-navy)"}
                fillOpacity={d.current ? 1 : 0.45}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
