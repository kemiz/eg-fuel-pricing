"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Bot, Wrench, Sparkles, AlertTriangle, CircleDot } from "lucide-react";
import type { GradeId, Site } from "@/lib/types";
import { formatPrice, unitLabel } from "@/lib/utils";

interface AgentEvent {
  type:
    | "status"
    | "agent_start"
    | "agent_tool"
    | "agent_message"
    | "recommendation"
    | "error";
  message?: string;
  agent?: string;
  role?: string;
  tool?: string;
  args?: Record<string, string>;
  content?: string;
  recommendation?: Recommendation;
}

interface Recommendation {
  siteId: string;
  gradeId: GradeId;
  recommendedPrice: number;
  rationale: string;
  projectedMargin: number | null;
  projectedVolume: number | null;
  confidence: number | null;
  perAgentNotes: { agent: string; note: string }[];
}

interface FeedItem {
  kind: "status" | "agent" | "tool" | "error";
  agent?: string;
  text: string;
}

const GRADES: { id: GradeId; label: string }[] = [
  { id: "regular", label: "Regular" },
  { id: "premium", label: "Premium" },
  { id: "diesel", label: "Diesel" },
];

export function AgentRoom({
  site,
  open,
  onClose,
  onSaved,
}: {
  site: Site;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [grade, setGrade] = useState<GradeId>("regular");
  const [running, setRunning] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [feed, recommendation]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setFeed([]);
    setRecommendation(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/pricing/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: site.siteId, grade }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "");
        setFeed((f) => [...f, { kind: "error", text: `Request failed: ${err || res.status}` }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") continue;
          let ev: AgentEvent;
          try {
            ev = JSON.parse(payload) as AgentEvent;
          } catch {
            continue;
          }
          handleEvent(ev);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setFeed((f) => [...f, { kind: "error", text: (e as Error).message }]);
      }
    } finally {
      setRunning(false);
    }

    function handleEvent(ev: AgentEvent) {
      switch (ev.type) {
        case "status":
          setFeed((f) => [...f, { kind: "status", text: ev.message ?? "" }]);
          break;
        case "agent_start":
          setFeed((f) => [
            ...f,
            { kind: "agent", agent: ev.agent, text: "joined the room…" },
          ]);
          break;
        case "agent_tool":
          setFeed((f) => [
            ...f,
            {
              kind: "tool",
              agent: ev.agent,
              text: `${ev.tool}(${Object.entries(ev.args ?? {})
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")})`,
            },
          ]);
          break;
        case "agent_message":
          setFeed((f) => [
            ...f,
            { kind: "agent", agent: ev.agent, text: ev.content ?? "" },
          ]);
          break;
        case "recommendation":
          if (ev.recommendation) {
            setRecommendation(ev.recommendation);
            onSaved?.();
          }
          break;
        case "error":
          setFeed((f) => [...f, { kind: "error", text: ev.message ?? "Unknown error" }]);
          break;
      }
    }
  }, [site.siteId, grade, onSaved]);

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-eg-line bg-eg-surface shadow-2xl">
      <div className="eg-gradient flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Bot size={18} />
          <div>
            <div className="text-sm font-semibold">Pricing Agent Room</div>
            <div className="text-[11px] text-white/70">{site.name}</div>
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-eg-line px-4 py-3">
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value as GradeId)}
          disabled={running}
          className="rounded-lg border border-eg-line bg-eg-surface px-2 py-1.5 text-sm"
        >
          {GRADES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={running}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-eg-red px-3 py-1.5 text-sm font-medium text-white hover:bg-eg-red-600 disabled:opacity-60"
        >
          <Sparkles size={15} />
          {running ? "Optimising…" : "Optimise price"}
        </button>
      </div>

      <div ref={feedRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {feed.length === 0 && !recommendation && (
          <p className="mt-8 text-center text-sm text-eg-ink-soft">
            Pick a grade and run the agents. The Demand, Competitor, Margin and
            Compliance agents will analyse this site and propose a price.
          </p>
        )}
        {feed.map((item, i) => (
          <FeedRow key={i} item={item} />
        ))}
        {recommendation && (
          <RecommendationCard rec={recommendation} site={site} />
        )}
      </div>
    </div>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  if (item.kind === "status") {
    return (
      <div className="flex items-center gap-2 text-xs text-eg-ink-soft">
        <CircleDot size={12} className="eg-pulse" />
        {item.text}
      </div>
    );
  }
  if (item.kind === "tool") {
    return (
      <div className="ml-4 flex items-center gap-2 font-mono text-[11px] text-eg-ink-soft">
        <Wrench size={11} />
        <span className="font-semibold">{item.agent}</span> {item.text}
      </div>
    );
  }
  if (item.kind === "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-eg-surface-2 px-2 py-1.5 text-xs text-eg-red">
        <AlertTriangle size={12} /> {item.text}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-eg-line bg-eg-surface-2 px-3 py-2 text-sm">
      <div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-eg-navy">
        <Bot size={12} /> {item.agent}
      </div>
      <div className="text-eg-ink">{item.text}</div>
    </div>
  );
}

function RecommendationCard({ rec, site }: { rec: Recommendation; site: Site }) {
  const country = site.country;
  return (
    <div className="mt-2 rounded-xl border-2 border-eg-navy bg-eg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-eg-ink-soft">
        Recommended {rec.gradeId} price
      </div>
      <div className="kpi-num mt-1 text-3xl font-bold text-eg-navy">
        {formatPrice(rec.recommendedPrice, site.currency)}
        <span className="text-base font-medium text-eg-ink-soft">
          {unitLabel(country)}
        </span>
      </div>
      <p className="mt-2 text-sm text-eg-ink">{rec.rationale}</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Proj. volume" value={rec.projectedVolume != null ? `${rec.projectedVolume}/day` : "—"} />
        <Stat
          label="Proj. margin"
          value={rec.projectedMargin != null ? formatPrice(rec.projectedMargin, site.currency) : "—"}
        />
        <Stat
          label="Confidence"
          value={rec.confidence != null ? `${Math.round(rec.confidence * 100)}%` : "—"}
        />
      </div>

      <div className="mt-3 space-y-1.5 border-t border-eg-line pt-3">
        {rec.perAgentNotes.map((n, i) => (
          <div key={i} className="text-xs">
            <span className="font-semibold text-eg-navy">{n.agent}:</span>{" "}
            <span className="text-eg-ink-soft">{n.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-eg-surface-2 px-2 py-1.5">
      <div className="kpi-num text-sm font-semibold text-eg-ink">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-eg-ink-soft">{label}</div>
    </div>
  );
}
