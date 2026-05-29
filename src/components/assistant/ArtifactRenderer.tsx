"use client";

import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Artifact model                                                            */
/* -------------------------------------------------------------------------- */

type Sentiment = "good" | "bad" | "neutral";

interface BarRow {
  label: string;
  value: number;
  display?: string;
  sentiment?: Sentiment;
}

export type Artifact =
  | { kind: "bar"; title?: string; rows: BarRow[] }
  | { kind: "donut"; title?: string; rows: BarRow[] }
  | { kind: "trend"; title?: string; values: number[]; labels?: string[]; unit?: string }
  | { kind: "metrics"; title?: string; rows: { label: string; value: string; sentiment?: Sentiment }[] }
  | { kind: "alert"; title: string; body?: string; tone?: Sentiment }
  | { kind: "metric-card"; label: string; value: string; delta?: string; sentiment?: Sentiment };

const PALETTE = ["#0a1f44", "#3f6fe0", "#e4002b", "#0f9d58", "#e8a23d", "#7c5cff"];

function sentimentColor(s?: Sentiment) {
  return s === "good" ? "#0f9d58" : s === "bad" ? "#e4002b" : "#3f6fe0";
}

/* -------------------------------------------------------------------------- */
/*  Parsing (markdown fence body -> Artifact)                                 */
/* -------------------------------------------------------------------------- */

/** Pipe-delimited rows: `Label | value | display | sentiment`. */
function parseRows(body: string): BarRow[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      const value = Number(parts[1]);
      return {
        label: parts[0] ?? "",
        value: Number.isFinite(value) ? value : 0,
        display: parts[2] || undefined,
        sentiment: (parts[3] as Sentiment) || undefined,
      };
    });
}

export function parseArtifact(type: string, body: string): Artifact | null {
  const t = type.replace(/^chart:|^card:/, "").toLowerCase();
  try {
    switch (t) {
      case "bar":
      case "bars":
      case "progress_bars":
        return { kind: "bar", rows: parseRows(body) };
      case "donut":
      case "pie":
        return { kind: "donut", rows: parseRows(body) };
      case "metrics":
        return {
          kind: "metrics",
          rows: parseRows(body).map((r) => ({
            label: r.label,
            value: r.display ?? String(r.value),
            sentiment: r.sentiment,
          })),
        };
      case "trend":
      case "line":
      case "sparkline": {
        // `label | value` rows, or a bare comma list of numbers.
        const rows = parseRows(body);
        if (rows.length && rows.some((r) => r.label)) {
          return {
            kind: "trend",
            values: rows.map((r) => r.value),
            labels: rows.map((r) => r.label),
          };
        }
        const nums = body
          .split(/[,\s]+/)
          .map(Number)
          .filter((n) => Number.isFinite(n));
        return { kind: "trend", values: nums };
      }
      case "alert": {
        const obj = JSON.parse(body) as {
          title?: string;
          body?: string;
          tone?: Sentiment;
        };
        return {
          kind: "alert",
          title: obj.title ?? "Alert",
          body: obj.body,
          tone: obj.tone,
        };
      }
      case "metric": {
        const obj = JSON.parse(body) as {
          label?: string;
          value?: string;
          delta?: string;
          sentiment?: Sentiment;
        };
        return {
          kind: "metric-card",
          label: obj.label ?? "",
          value: obj.value ?? "",
          delta: obj.delta,
          sentiment: obj.sentiment,
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Renderer                                                                  */
/* -------------------------------------------------------------------------- */

export function ArtifactRenderer({ artifact }: { artifact: Artifact }) {
  switch (artifact.kind) {
    case "bar":
      return <BarChart title={artifact.title} rows={artifact.rows} />;
    case "donut":
      return <DonutChart title={artifact.title} rows={artifact.rows} />;
    case "trend":
      return (
        <TrendChart
          title={artifact.title}
          values={artifact.values}
          labels={artifact.labels}
        />
      );
    case "metrics":
      return <MetricRow title={artifact.title} rows={artifact.rows} />;
    case "alert":
      return <AlertCard {...artifact} />;
    case "metric-card":
      return <MetricCard {...artifact} />;
  }
}

function ChartShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="my-2 rounded-xl border border-eg-line bg-eg-surface-2/60 p-3">
      {title && (
        <div className="mb-2 text-xs font-semibold text-eg-ink">{title}</div>
      )}
      {children}
    </div>
  );
}

function BarChart({ title, rows }: { title?: string; rows: BarRow[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ChartShell title={title}>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-28 shrink-0 truncate text-eg-ink-soft" title={r.label}>
              {r.label}
            </span>
            <div className="h-3.5 flex-1 overflow-hidden rounded bg-eg-surface">
              <div
                className="h-full rounded"
                style={{
                  width: `${(r.value / max) * 100}%`,
                  background: r.sentiment
                    ? sentimentColor(r.sentiment)
                    : PALETTE[i % PALETTE.length],
                }}
              />
            </div>
            <span className="kpi-num w-16 shrink-0 text-right font-semibold text-eg-ink">
              {r.display ?? r.value}
            </span>
          </div>
        ))}
      </div>
    </ChartShell>
  );
}

function DonutChart({ title, rows }: { title?: string; rows: BarRow[] }) {
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  let offset = 0;
  const R = 28;
  const C = 2 * Math.PI * R;
  return (
    <ChartShell title={title}>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 72 72" className="h-20 w-20 -rotate-90">
          {rows.map((r, i) => {
            const frac = r.value / total;
            const dash = frac * C;
            const seg = (
              <circle
                key={i}
                cx={36}
                cy={36}
                r={R}
                fill="none"
                stroke={r.sentiment ? sentimentColor(r.sentiment) : PALETTE[i % PALETTE.length]}
                strokeWidth={10}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
        </svg>
        <div className="space-y-1">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: r.sentiment ? sentimentColor(r.sentiment) : PALETTE[i % PALETTE.length],
                }}
              />
              <span className="text-eg-ink-soft">{r.label}</span>
              <span className="kpi-num font-semibold text-eg-ink">
                {r.display ?? `${Math.round((r.value / total) * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartShell>
  );
}

function TrendChart({
  title,
  values,
  labels,
}: {
  title?: string;
  values: number[];
  labels?: string[];
}) {
  if (!values.length) return null;
  const w = 280;
  const h = 60;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w;
    const y = h - ((v - min) / span) * (h - 8) - 4;
    return [x, y] as const;
  });
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const up = values[values.length - 1] >= values[0];
  const color = up ? "#0f9d58" : "#e4002b";
  return (
    <ChartShell title={title}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
        <polygon points={area} fill={color} opacity={0.12} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
      {labels && labels.length > 0 && (
        <div className="mt-1 flex justify-between text-[10px] text-eg-ink-soft">
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </ChartShell>
  );
}

function MetricRow({
  title,
  rows,
}: {
  title?: string;
  rows: { label: string; value: string; sentiment?: Sentiment }[];
}) {
  return (
    <ChartShell title={title}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg bg-eg-surface px-2.5 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-eg-ink-soft">
              {r.label}
            </div>
            <div
              className="kpi-num text-sm font-bold"
              style={{ color: r.sentiment ? sentimentColor(r.sentiment) : "var(--eg-ink)" }}
            >
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </ChartShell>
  );
}

function AlertCard({
  title,
  body,
  tone,
}: {
  title: string;
  body?: string;
  tone?: Sentiment;
}) {
  const toneCls =
    tone === "bad"
      ? "border-eg-red/40 bg-[var(--delta-dear-bg)]"
      : tone === "good"
        ? "border-[var(--delta-cheap-fg)]/30 bg-[var(--delta-cheap-bg)]"
        : "border-eg-line bg-eg-surface-2";
  return (
    <div className={cn("my-2 flex gap-2 rounded-xl border p-3", toneCls)}>
      <AlertTriangle
        size={16}
        className="mt-0.5 shrink-0"
        style={{ color: sentimentColor(tone) }}
      />
      <div>
        <div className="text-sm font-semibold text-eg-ink">{title}</div>
        {body && <div className="mt-0.5 text-xs text-eg-ink-soft">{body}</div>}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  sentiment,
}: {
  label: string;
  value: string;
  delta?: string;
  sentiment?: Sentiment;
}) {
  const Icon = sentiment === "good" ? TrendingUp : sentiment === "bad" ? TrendingDown : Minus;
  return (
    <div className="my-2 inline-flex min-w-40 flex-col rounded-xl border border-eg-line bg-eg-surface-2 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-eg-ink-soft">{label}</div>
      <div className="kpi-num text-xl font-bold text-eg-navy">{value}</div>
      {delta && (
        <div
          className="mt-0.5 flex items-center gap-1 text-[11px] font-medium"
          style={{ color: sentimentColor(sentiment) }}
        >
          <Icon size={12} /> {delta}
        </div>
      )}
    </div>
  );
}

export function InlineArtifact({ type, body }: { type: string; body: string }) {
  const artifact = parseArtifact(type, body);
  if (!artifact) return null;
  return <ArtifactRenderer artifact={artifact} />;
}
