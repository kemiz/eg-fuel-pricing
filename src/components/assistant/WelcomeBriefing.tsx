"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Gauge,
} from "lucide-react";
import type { AskBriefing, BriefingCard, CardTone } from "@/lib/data/server";
import { ChangeFlash } from "@/components/ChangeFlash";
import { SimRefreshing } from "@/components/SimRefreshing";

const TONE_ACCENT: Record<CardTone, string> = {
  good: "var(--delta-cheap-fg)",
  watch: "#e8a23d",
  bad: "var(--eg-red)",
  info: "var(--eg-navy)",
};

const TONE_ICON: Record<CardTone, typeof AlertTriangle> = {
  good: TrendingUp,
  watch: Gauge,
  bad: AlertTriangle,
  info: Sparkles,
};

export function WelcomeBriefing({
  greetingName,
  briefing,
  suggestions,
  onAsk,
}: {
  greetingName?: string;
  briefing: AskBriefing;
  suggestions: { label: string; prompt: string }[];
  onAsk: (prompt: string) => void;
}) {
  // Time-of-day greeting depends on the local clock, which differs between the
  // server and the client — computing it during render causes a hydration
  // mismatch. Render a neutral greeting first (server + first client render
  // agree), then upgrade to the time-based one after mount.
  const [greet, setGreet] = useState("Welcome");
  useEffect(() => {
    const hour = new Date().getHours();
    setGreet(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-7">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-eg-navy to-eg-navy-700 text-white shadow-lg shadow-eg-navy/30">
          <Sparkles size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-eg-ink">
            {greet}
            {greetingName ? `, ${greetingName}` : ""} — here&apos;s your network
          </h2>
          <p className="text-sm text-eg-ink-soft">
            Click any card to dig in, or ask your own question below.
          </p>
        </div>
      </div>

      {/* Snapshot */}
      <Section label="Network snapshot">
        <SimRefreshing>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {briefing.snapshot.map((c, i) => (
              <BriefingTile key={i} card={c} index={i} onAsk={onAsk} />
            ))}
          </div>
        </SimRefreshing>
      </Section>

      {/* Focus areas */}
      {briefing.focus.length > 0 && (
        <Section label="Worth a look">
          <SimRefreshing>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {briefing.focus.map((c, i) => (
                <BriefingTile key={i} card={c} index={i} onAsk={onAsk} />
              ))}
            </div>
          </SimRefreshing>
        </Section>
      )}

      {/* Suggested prompts */}
      <Section label="Try asking">
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.prompt}
              onClick={() => onAsk(s.prompt)}
              className="eg-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-eg-ink-soft hover:text-eg-navy"
            >
              <Sparkles size={12} className="text-eg-navy" /> {s.label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

/**
 * Vertical rail of briefing cards that flanks the chat once a conversation
 * starts — the cards don't vanish, they dock to the side. Reuses the same
 * tile in a slightly denser layout. `side` only affects the heading alignment.
 */
export function BriefingRail({
  label,
  cards,
  onAsk,
  indexOffset = 0,
}: {
  label: string;
  cards: BriefingCard[];
  onAsk: (prompt: string) => void;
  indexOffset?: number;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="space-y-2.5">
      <div className="px-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-eg-ink-soft">
        {label}
      </div>
      <SimRefreshing>
        <div className="space-y-2.5">
          {cards.map((c, i) => (
            <BriefingTile key={i} card={c} index={indexOffset + i} onAsk={onAsk} />
          ))}
        </div>
      </SimRefreshing>
    </div>
  );
}

/** Pull the leading numeric out of a metric string for flash direction. */
function parseMetric(metric: string): number | null {
  const m = metric.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="px-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-eg-ink-soft">
        {label}
      </div>
      {children}
    </section>
  );
}

function BriefingTile({
  card,
  index,
  onAsk,
}: {
  card: BriefingCard;
  index: number;
  onAsk: (prompt: string) => void;
}) {
  const Icon = TONE_ICON[card.tone];
  const accent = TONE_ACCENT[card.tone];
  return (
    <button
      onClick={() => onAsk(card.prompt)}
      className="eg-tile eg-tile-hover group flex flex-col p-3.5 text-left"
    >
      {/* tinted accent rail down the left edge */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: accent }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-eg-ink-soft">
          {card.eyebrow}
        </span>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
        >
          <Icon size={13} style={{ color: accent }} />
        </span>
      </div>

      {card.metric && (
        <ChangeFlash
          as="div"
          value={card.metric}
          numeric={parseMetric(card.metric)}
          className="kpi-num mt-1.5 inline-block self-start px-1 text-xl font-bold text-eg-navy"
        >
          {card.metric}
        </ChangeFlash>
      )}
      <div
        className="mt-0.5 truncate text-sm font-semibold text-eg-ink"
        title={card.label}
      >
        {card.label}
      </div>

      {/* Inline mini chart — real recent series when available (moves with the
          simulation), else a deterministic decorative shape. */}
      <MiniChart tone={card.tone} accent={accent} seed={index} data={card.spark} />

      <p className="mt-1.5 line-clamp-2 text-xs text-eg-ink-soft">{card.detail}</p>
      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-eg-navy opacity-0 transition-opacity group-hover:opacity-100">
        Ask about this <ArrowRight size={11} />
      </span>
    </button>
  );
}

/* Inline mini sparkline rendered on each card. When the card carries a real
   `data` series (network/region/site price history that grows with the
   simulation) we plot that; otherwise we fall back to a deterministic
   decorative shape keyed by tone + seed. Pure SVG so it inherits the glass
   surface and theme colours. */
function MiniChart({
  tone,
  accent,
  seed,
  data,
}: {
  tone: CardTone;
  accent: string;
  seed: number;
  data?: number[];
}) {
  const w = 200;
  const h = 30;

  // Cheap seeded pseudo-random for the fallback shape (stable per card).
  const rand = (i: number) => {
    const x = Math.sin((i + 1) * (seed + 2) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  const hasReal = Array.isArray(data) && data.length > 1;
  const n = hasReal ? data!.length : 12;

  const values: number[] = hasReal
    ? data!.slice()
    : Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const noise = (rand(i) - 0.5) * 0.28;
        switch (tone) {
          case "good":
            return 0.25 + t * 0.6 + noise;
          case "bad":
            return 0.85 - t * 0.6 + noise;
          case "watch":
            return 0.5 + Math.sin(t * Math.PI * 3) * 0.28 + noise * 0.6;
          default:
            return 0.4 + t * 0.35 + noise * 0.5;
        }
      }).map((v) => Math.min(0.98, Math.max(0.04, v)));

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const gid = `mc-${tone}-${seed}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-2 h-7 w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
          <stop offset="100%" stopColor={accent} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={accent}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r={2.4}
        fill={accent}
      />
    </svg>
  );
}
