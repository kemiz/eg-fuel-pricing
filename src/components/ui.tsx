import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Surfaces                                                                  */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-wide text-eg-red">
            {eyebrow}
          </div>
        )}
        <h2 className="text-base font-semibold text-eg-ink">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-eg-ink-soft">{description}</p>
        )}
      </div>
      {right}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  asOf,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  asOf?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-wide text-eg-red">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-eg-ink">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-eg-ink-soft">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {asOf && (
          <span className="text-xs text-eg-ink-soft">As of {asOf}</span>
        )}
        {right}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Indicators                                                                */
/* -------------------------------------------------------------------------- */

type Tone = "neutral" | "good" | "watch" | "bad" | "info";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-eg-surface-2 text-eg-ink-soft border border-eg-line",
  good: "delta-cheap",
  watch: "delta-near",
  bad: "delta-dear",
  info: "bg-eg-navy/10 text-eg-navy border border-eg-navy/20",
};

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-eg-ink-soft">
        {label}
      </div>
      <div className="kpi-num mt-0.5 text-2xl font-bold text-eg-navy">
        {value}
        {unit && (
          <span className="ml-0.5 text-sm font-medium text-eg-ink-soft">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/** Inline SVG sparkline (no recharts) for KPI cards. */
export function Sparkline({
  values,
  positive,
  className,
}: {
  values: number[];
  positive?: boolean;
  className?: string;
}) {
  if (!values.length) return null;
  const w = 120;
  const h = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = positive
    ? "var(--delta-cheap-fg)"
    : positive === false
      ? "var(--eg-red)"
      : "var(--eg-navy)";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-9 w-full", className)}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-eg-line px-6 py-10 text-center",
        className
      )}
    >
      <div className="text-sm font-semibold text-eg-ink">{title}</div>
      {detail && <p className="mt-1 max-w-sm text-xs text-eg-ink-soft">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Skeleton({
  className,
  rounded = "md",
}: {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}) {
  const r = {
    sm: "rounded",
    md: "rounded-lg",
    lg: "rounded-xl",
    full: "rounded-full",
  }[rounded];
  return (
    <div className={cn("animate-pulse bg-eg-surface-2", r, className)} />
  );
}
