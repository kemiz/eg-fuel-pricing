"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Gauge,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";
import { useSim, SPEED_OPTIONS, type PerfSummaryDTO } from "@/lib/sim/provider";
import { cn, formatCompactMoney } from "@/lib/utils";

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const speedLabel = (ms: number) => {
  if (ms >= 60000) {
    const min = ms / 60000;
    return `${Number.isInteger(min) ? min : min.toFixed(1)} min`;
  }
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0)}s`;
  return `${ms}ms`;
};

export function SimBar() {
  const { state, events, perf, busy, playing, cycleStart, error, play, pause, step, setSpeed, reset } =
    useSim();
  const [speedOpen, setSpeedOpen] = useState(false);

  const latest = events[0];
  const speed = state?.speedMs ?? 3000;

  return (
    <div className="border-t border-white/10 bg-black/10">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        {/* Clock */}
        <div className="flex items-center gap-2 text-white">
          <Clock size={14} className="text-white/70" />
          <span className="text-sm font-semibold tabular-nums">
            {fmtDate(state?.simDate)}
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white/85">
            Day {state?.dayIndex ?? 0}
          </span>
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-1">
          <div className="relative inline-flex">
            {playing && (
              <CountdownRing cycleStart={cycleStart} durationMs={speed} />
            )}
            <button
              onClick={() => (playing ? pause() : play())}
              disabled={!state}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
                playing
                  ? "bg-white/20 text-white hover:bg-white/30"
                  : "bg-eg-green text-eg-navy hover:brightness-105"
              )}
              aria-label={playing ? "Pause simulation" : "Play simulation"}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? "Pause" : "Play"}
            </button>
          </div>

          <button
            onClick={() => step(1)}
            disabled={!state || playing || busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/85 transition-colors hover:bg-white/10 disabled:opacity-40"
            aria-label="Advance one day"
            title="Advance one day"
          >
            <SkipForward size={14} /> +1d
          </button>
          <button
            onClick={() => step(7)}
            disabled={!state || playing || busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/85 transition-colors hover:bg-white/10 disabled:opacity-40"
            aria-label="Advance one week"
            title="Advance seven days"
          >
            +1w
          </button>

          {/* Speed */}
          <div className="relative">
            <button
              onClick={() => setSpeedOpen((o) => !o)}
              disabled={!state}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/85 transition-colors hover:bg-white/10 disabled:opacity-40"
              aria-label="Simulation speed"
              title="Tick speed"
            >
              <Gauge size={14} /> {speedLabel(speed)}
            </button>
            {speedOpen && (
              <div
                className="eg-glass eg-glass-strong absolute left-0 top-full z-40 mt-1 flex max-h-72 w-36 flex-col overflow-y-auto rounded-xl p-1 text-eg-ink shadow-lg"
                onMouseLeave={() => setSpeedOpen(false)}
              >
                {SPEED_OPTIONS.map((ms) => (
                  <button
                    key={ms}
                    onClick={() => {
                      setSpeed(ms);
                      setSpeedOpen(false);
                    }}
                    className={cn(
                      "flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-eg-navy/10",
                      ms === speed && "font-semibold text-eg-navy"
                    )}
                  >
                    <span>{speedLabel(ms)}</span>
                    <span className="text-xs text-eg-ink-soft">/ day</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={reset}
            disabled={!state || busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label="Reset simulation"
            title="Reset to baseline"
          >
            <RotateCcw size={14} /> Reset
          </button>

          {busy && (
            <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-eg-green" />
          )}
        </div>

        {/* Cumulative performance chip — links to the Performance tab. */}
        {perf && perf.days > 0 && <PerfChip perf={perf} />}

        {/* Latest event / status */}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {error ? (
            <span className="flex items-center gap-1.5 truncate text-xs text-eg-red">
              <AlertTriangle size={13} /> {error.slice(0, 80)}
            </span>
          ) : latest ? (
            <EventBadge latest={latest} />
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-white/55">
              <Info size={13} /> Synthetic market — press play to advance days
            </span>
          )}
        </div>

        {/* Countdown to next day — pinned far right with a fixed width so its
            changing text never shifts the transport buttons or event badge. */}
        {playing && (
          <div className="flex shrink-0 justify-end">
            <CountdownText cycleStart={cycleStart} durationMs={speed} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Smooth progress fraction (0 → 1) over `durationMs` since `cycleStart`,
 * animated with requestAnimationFrame. Returns 0 when not active.
 */
function useCycleProgress(cycleStart: number | null, durationMs: number) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (cycleStart == null || durationMs <= 0) {
      setProgress(0);
      return;
    }
    const tick = () => {
      const elapsed = Date.now() - cycleStart;
      const p = Math.min(1, Math.max(0, elapsed / durationMs));
      setProgress(p);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [cycleStart, durationMs]);

  return progress;
}

/** Rounded-rect stroke tracing the Play/Pause button that empties as the next
 *  day approaches — a visual countdown anchored to the shared clock cycle.
 *  Renders at the button's true pixel size (no aspect-ratio stretching) so the
 *  corners and stroke width stay uniform and match the button exactly. */
function CountdownRing({
  cycleStart,
  durationMs,
}: {
  cycleStart: number | null;
  durationMs: number;
}) {
  const progress = useCycleProgress(cycleStart, durationMs);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Track the box size so the SVG can use a 1:1 (un-stretched) coordinate
  // system — this is what keeps the rounded rect from looking skewed.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sw = 2; // stroke width in px
  const w = size?.w ?? 0;
  const h = size?.h ?? 0;
  // Inset by half the stroke so the line sits fully inside the box, and match
  // the button's rounded-lg (8px) plus the 2px outset of this overlay.
  const inset = sw / 2;
  const radius = 10;

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute -inset-[2px] z-10"
      aria-hidden
    >
      {size && (
        <svg width={w} height={h} className="block">
          <rect
            x={inset}
            y={inset}
            width={Math.max(0, w - sw)}
            height={Math.max(0, h - sw)}
            rx={radius}
            ry={radius}
            fill="none"
            stroke="var(--eg-green)"
            strokeWidth={sw}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={progress * 100}
            style={{ transition: "stroke-dashoffset 80ms linear" }}
          />
        </svg>
      )}
    </div>
  );
}

/** Seconds remaining until the next day, e.g. "2s". */
function CountdownText({
  cycleStart,
  durationMs,
}: {
  cycleStart: number | null;
  durationMs: number;
}) {
  const progress = useCycleProgress(cycleStart, durationMs);
  const remainingMs = Math.max(0, durationMs * (1 - progress));
  const secs = remainingMs / 1000;
  const label =
    secs >= 60
      ? `${Math.ceil(secs / 60)}m`
      : secs >= 10
        ? `${Math.ceil(secs)}s`
        : `${secs.toFixed(1)}s`;
  return (
    <span
      className="w-[5.5rem] text-right text-[11px] font-medium tabular-nums text-white/70"
      title="Time until next day"
    >
      next in {label}
    </span>
  );
}

/** Compact cumulative-performance chip in the global bar; links to the
 *  Performance tab. Shows the margin pool earned over the run and the uplift
 *  vs holding baseline prices flat. */
function PerfChip({ perf }: { perf: PerfSummaryDTO }) {
  const up = perf.cumUplift >= 0;
  const UpIcon = up ? TrendingUp : TrendingDown;
  return (
    <Link
      href="/analytics?tab=performance"
      className="group hidden items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1 transition-colors hover:bg-white/20 sm:flex"
      title={`Cumulative fuel margin over ${perf.days} simulated ${
        perf.days === 1 ? "day" : "days"
      } · uplift vs holding baseline prices flat. Click for the Performance tab.`}
    >
      <span className="text-[11px] font-medium uppercase tracking-wide text-white/55">
        Run
      </span>
      <span className="text-sm font-semibold tabular-nums text-white">
        {formatCompactMoney(perf.cumMarginPool, perf.currency)}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
          up ? "text-eg-green" : "text-eg-red"
        )}
      >
        <UpIcon size={12} />
        {up ? "+" : "−"}
        {formatCompactMoney(Math.abs(perf.cumUplift), perf.currency)}
      </span>
    </Link>
  );
}

function EventBadge({ latest }: { latest: ReturnType<typeof useSim>["events"][number] }) {
  const tone =
    latest.tone === "bad"
      ? "text-eg-red"
      : latest.tone === "good"
        ? "text-eg-green"
        : "text-white/75";
  const Icon = latest.tone === "good" ? TrendingUp : AlertTriangle;
  return (
    <span
      className={cn("flex min-w-0 items-center gap-1.5 text-xs", tone)}
      title={latest.detail ?? latest.headline}
    >
      <Icon size={13} className="shrink-0" />
      <span className="truncate">{latest.headline}</span>
    </span>
  );
}
