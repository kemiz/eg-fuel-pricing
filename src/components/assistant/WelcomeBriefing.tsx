"use client";

import {
  AlertTriangle,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Gauge,
} from "lucide-react";
import type { AskBriefing, BriefingCard, CardTone } from "@/lib/data/server";
import { cn } from "@/lib/utils";

const TONE_BORDER: Record<CardTone, string> = {
  good: "border-l-[var(--delta-cheap-fg)]",
  watch: "border-l-[#e8a23d]",
  bad: "border-l-eg-red",
  info: "border-l-eg-navy",
};

const TONE_ICON: Record<CardTone, typeof AlertTriangle> = {
  good: TrendingUp,
  watch: Gauge,
  bad: AlertTriangle,
  info: Sparkles,
};

const TONE_ICON_COLOR: Record<CardTone, string> = {
  good: "text-[var(--delta-cheap-fg)]",
  watch: "text-[#b9791a]",
  bad: "text-eg-red",
  info: "text-eg-navy",
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
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-eg-navy text-white">
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {briefing.snapshot.map((c, i) => (
            <BriefingTile key={i} card={c} onAsk={onAsk} />
          ))}
        </div>
      </Section>

      {/* Focus areas */}
      {briefing.focus.length > 0 && (
        <Section label="Worth a look">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {briefing.focus.map((c, i) => (
              <BriefingTile key={i} card={c} onAsk={onAsk} />
            ))}
          </div>
        </Section>
      )}

      {/* Suggested prompts */}
      <Section label="Try asking">
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.prompt}
              onClick={() => onAsk(s.prompt)}
              className="inline-flex items-center gap-1.5 rounded-full border border-eg-line bg-eg-surface px-3 py-1.5 text-xs text-eg-ink-soft transition-colors hover:border-eg-navy hover:text-eg-navy"
            >
              <Sparkles size={12} /> {s.label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="px-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-eg-ink-soft">
        {label}
      </div>
      {children}
    </section>
  );
}

function BriefingTile({
  card,
  onAsk,
}: {
  card: BriefingCard;
  onAsk: (prompt: string) => void;
}) {
  const Icon = TONE_ICON[card.tone];
  return (
    <button
      onClick={() => onAsk(card.prompt)}
      className={cn(
        "group flex flex-col rounded-xl border border-eg-line border-l-[3px] bg-eg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
        TONE_BORDER[card.tone]
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-eg-ink-soft">
          {card.eyebrow}
        </span>
        <Icon size={13} className={TONE_ICON_COLOR[card.tone]} />
      </div>
      {card.metric && (
        <div className="kpi-num mt-1 text-xl font-bold text-eg-navy">{card.metric}</div>
      )}
      <div className="mt-0.5 truncate text-sm font-semibold text-eg-ink" title={card.label}>
        {card.label}
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-eg-ink-soft">{card.detail}</p>
      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-eg-navy opacity-0 transition-opacity group-hover:opacity-100">
        Ask about this <ArrowRight size={11} />
      </span>
    </button>
  );
}
