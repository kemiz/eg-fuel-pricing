"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, User, Bot, Square, CornerDownRight } from "lucide-react";
import type { GradeId, Site } from "@/lib/types";
import type { AskBriefing } from "@/lib/data/server";
import { formatPrice, unitLabel } from "@/lib/utils";
import {
  AssistantMarkdown,
  EntityProvider,
  parseFollowUps,
  type EntityHandlers,
} from "./AssistantMessage";
import { AgentStepsInline, type AgentStep } from "./AgentSteps";
import { WelcomeBriefing } from "./WelcomeBriefing";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: AgentStep[];
  recommendation?: Recommendation;
  followUps?: string[];
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

interface AgentEvent {
  type: string;
  message?: string;
  agent?: string;
  tool?: string;
  args?: Record<string, string>;
  content?: string;
  recommendation?: Recommendation;
}

let _id = 0;
const nextId = () => `m${++_id}`;

export function AskAssistant({
  sites,
  suggestions,
  focusSite,
  initialQuery,
  compact,
  fill,
  briefing,
}: {
  sites: Site[];
  suggestions?: string[];
  /** When embedded on a site page, adds that site to context + enables Optimise. */
  focusSite?: Site;
  initialQuery?: string;
  compact?: boolean;
  /** Fill the parent container's height instead of using a fixed pixel height. */
  fill?: boolean;
  /** Live landing dashboard cards for the empty state. */
  briefing?: AskBriefing;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState<{ content: string; steps: AgentStep[] } | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const siteIndex = useRef(sites);
  useEffect(() => {
    siteIndex.current = sites;
  }, [sites]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const entityHandlers: EntityHandlers = {
    onSite: (id) => router.push(`/site/${id}`),
    onRegion: (region) =>
      router.push(`/network?region=${encodeURIComponent(region)}`),
  };

  /** Resolve a site from free text (used by "optimise X" intent). */
  const resolveSite = useCallback((text: string): Site | null => {
    const q = text.toLowerCase();
    return (
      siteIndex.current.find((s) => q.includes(s.name.toLowerCase())) ??
      siteIndex.current.find(
        (s) =>
          q.includes(s.brand.toLowerCase()) &&
          (s.region ? q.includes(s.region.toLowerCase()) : false)
      ) ??
      null
    );
  }, []);

  /* ----------------------- multi-agent pricing run ----------------------- */
  const runAgents = useCallback(
    async (site: Site, grade: GradeId, assistantId: string) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const steps: AgentStep[] = [];
      const pushStep = (s: AgentStep) => {
        steps.push(s);
        setStreaming({ content: "", steps: [...steps] });
      };

      try {
        const res = await fetch("/api/pricing/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: site.siteId, grade }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let rec: Recommendation | null = null;

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            let ev: AgentEvent;
            try {
              ev = JSON.parse(payload) as AgentEvent;
            } catch {
              continue;
            }
            switch (ev.type) {
              case "status":
                steps.forEach((s) => (s.status = "done"));
                pushStep({
                  id: nextId(),
                  type: "synthesizing",
                  label: ev.message ?? "",
                  status: "active",
                });
                break;
              case "agent_start":
                pushStep({
                  id: nextId(),
                  type: "agent",
                  label: `${ev.agent} joined`,
                  status: "active",
                });
                break;
              case "agent_tool":
                pushStep({
                  id: nextId(),
                  type: "tool-call",
                  label: `${ev.agent}: ${ev.tool}`,
                  detail: Object.entries(ev.args ?? {})
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", "),
                  status: "done",
                });
                break;
              case "agent_message":
                // Mark that agent's latest as done.
                for (let i = steps.length - 1; i >= 0; i--) {
                  if (steps[i].label.startsWith(ev.agent ?? "")) {
                    steps[i].status = "done";
                    break;
                  }
                }
                break;
              case "recommendation":
                rec = ev.recommendation ?? null;
                break;
            }
          }
        }

        steps.forEach((s) => (s.status = "done"));
        const summary = rec
          ? buildRecMarkdown(rec, site)
          : "The pricing agents finished but did not return a recommendation.";
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: summary,
                  steps: [...steps],
                  recommendation: rec ?? undefined,
                  followUps: rec
                    ? [
                        "Optimise the premium grade too",
                        "Optimise the diesel grade",
                        "How does this compare to local rivals?",
                      ]
                    : undefined,
                }
              : msg
          )
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: `Sorry — the agents failed: ${(e as Error).message}` }
              : msg
          )
        );
      } finally {
        setStreaming(null);
        setBusy(false);
      }
    },
    []
  );

  /* ----------------------------- text Q&A -------------------------------- */
  const runChat = useCallback(
    async (history: ChatMsg[], assistantId: string) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStreaming({ content: "", steps: [] });
      let acc = "";
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            siteId: focusSite?.siteId,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const data = JSON.parse(payload) as { delta?: string; error?: string };
              if (data.error) throw new Error(data.error);
              if (data.delta) {
                acc += data.delta;
                setStreaming({ content: acc, steps: [] });
              }
            } catch (err) {
              if (err instanceof Error && err.message) throw err;
            }
          }
        }
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: acc, followUps: parseFollowUps(acc) }
              : msg
          )
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: acc || `Sorry — ${(e as Error).message}` }
              : msg
          )
        );
      } finally {
        setStreaming(null);
        setBusy(false);
      }
    },
    [focusSite?.siteId]
  );

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      setBusy(true);

      const userMsg: ChatMsg = { id: nextId(), role: "user", content: text };
      const assistantId = nextId();
      const assistantMsg: ChatMsg = { id: assistantId, role: "assistant", content: "" };
      const history = [...messages, userMsg];
      setMessages([...history, assistantMsg]);

      // Intent: only run the multi-agent pricing flow on an explicit request to
      // GENERATE a new price ("optimise…", "run the agents", "set/recommend a
      // price for…"). Analytical questions (why/which/how/break down/compare)
      // always go to the conversational Q&A path.
      const isQuestion = /\b(why|which|what|how|where|compare|break (it |this )?down|explain|show|list|rank)\b/i.test(
        text
      );
      const wantsOptimise =
        /\b(optimi[sz]e|run the (pricing )?agents|recommend a (new )?price|set (a |the )?price)\b/i.test(
          text
        ) && !isQuestion;
      const site = wantsOptimise ? focusSite ?? resolveSite(text) : null;
      if (site) {
        const grade: GradeId = /premium/i.test(text)
          ? "premium"
          : /diesel/i.test(text)
            ? "diesel"
            : "regular";
        void runAgents(site, grade, assistantId);
      } else {
        void runChat(history, assistantId);
      }
    },
    [busy, messages, focusSite, resolveSite, runAgents, runChat]
  );

  const ranInitial = useRef(false);
  useEffect(() => {
    if (initialQuery && !ranInitial.current) {
      ranInitial.current = true;
      submit(initialQuery);
    }
  }, [initialQuery, submit]);

  function stop() {
    abortRef.current?.abort();
    setStreaming(null);
    setBusy(false);
  }

  const empty = messages.length === 0 && !streaming;
  const defaultSuggestions = suggestions ?? [
    "Which regions have the best margins?",
    "Where are we priced above our competitors?",
    "Show me the network split: cheaper vs dearer than rivals",
    focusSite
      ? `Optimise the regular price for ${focusSite.name}`
      : "Optimise the regular price for Cumberland Farms Orlando",
  ];

  return (
    <EntityProvider handlers={entityHandlers}>
      <div
        className="card flex flex-col overflow-hidden"
        style={fill ? { height: "100%" } : { height: compact ? 520 : 640 }}
      >
        <div
          ref={scrollRef}
          className="eg-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4"
        >
          {empty && briefing && (
            <WelcomeBriefing
              briefing={briefing}
              suggestions={defaultSuggestions.map((s) => ({ label: s, prompt: s }))}
              onAsk={(p) => submit(p)}
            />
          )}

          {empty && !briefing && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-eg-navy text-white">
                <Sparkles size={22} />
              </div>
              <h3 className="mt-3 text-lg font-semibold text-eg-ink">
                {focusSite ? "Ask about this site" : "Ask EG"}
              </h3>
              <p className="mt-1 max-w-md text-sm text-eg-ink-soft">
                {focusSite
                  ? "Ask about costs, competitors or demand — or say “optimise the regular price” to run the pricing agents."
                  : "Your live pricing analyst. Ask about margins, competitors and demand across the network."}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {defaultSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="rounded-full border border-eg-line bg-eg-surface px-3 py-1.5 text-xs text-eg-ink-soft transition-colors hover:border-eg-navy hover:text-eg-navy"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end gap-2">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-eg-navy px-3.5 py-2 text-sm text-white">
                    {m.content}
                  </div>
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-eg-surface-2 text-eg-ink-soft">
                    <User size={14} />
                  </div>
                </div>
              );
            }
            const isStreamingThis =
              streaming && m.id === messages[messages.length - 1]?.id && !m.content;
            return (
              <div key={m.id} className="flex justify-start gap-2">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-eg-navy text-white">
                  <Bot size={14} />
                </div>
                <div className="min-w-0 max-w-[85%] space-y-2">
                  {isStreamingThis ? (
                    <StreamingBubble streaming={streaming} />
                  ) : (
                    <>
                      <div className="rounded-2xl rounded-bl-sm border border-eg-line bg-eg-surface px-3.5 py-2.5">
                        {m.steps && m.steps.length > 0 && (
                          <div className="mb-2">
                            <AgentStepsInline steps={m.steps} isActive={false} />
                          </div>
                        )}
                        {m.recommendation && focusSiteForRec(m, sites) && (
                          <RecommendationCard
                            rec={m.recommendation}
                            site={focusSiteForRec(m, sites)!}
                          />
                        )}
                        <AssistantMarkdown content={m.content} />
                      </div>
                      {m.followUps && m.followUps.length > 0 && !busy && (
                        <FollowUpChips items={m.followUps} onAsk={submit} />
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="border-t border-eg-line p-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={1}
              placeholder={
                focusSite
                  ? `Ask about ${focusSite.name}, or "optimise the regular price"…`
                  : "Ask about margins, competitors, demand…"
              }
              className="max-h-32 flex-1 resize-none rounded-xl border border-eg-line bg-eg-surface px-3 py-2 text-sm outline-none focus:border-eg-navy"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-eg-surface-2 text-eg-ink-soft hover:bg-eg-line"
                aria-label="Stop"
              >
                <Square size={15} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-eg-red text-white transition-colors hover:bg-eg-red-600 disabled:opacity-40"
                aria-label="Send"
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </form>
      </div>
    </EntityProvider>
  );
}

function FollowUpChips({
  items,
  onAsk,
}: {
  items: string[];
  onAsk: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pl-0.5">
      {items.map((q) => (
        <button
          key={q}
          onClick={() => onAsk(q)}
          className="inline-flex items-center gap-1 rounded-full border border-eg-line bg-eg-surface px-2.5 py-1 text-[11px] font-medium text-eg-ink-soft transition-colors hover:border-eg-navy hover:bg-eg-surface-2 hover:text-eg-navy"
        >
          <CornerDownRight size={11} /> {q}
        </button>
      ))}
    </div>
  );
}

function StreamingBubble({
  streaming,
}: {
  streaming: { content: string; steps: AgentStep[] };
}) {
  return (
    <div className="rounded-2xl rounded-bl-sm border border-eg-line bg-eg-surface px-3.5 py-2.5">
      {streaming.steps.length > 0 && (
        <div className="mb-2">
          <AgentStepsInline steps={streaming.steps} isActive />
        </div>
      )}
      {streaming.content ? (
        <AssistantMarkdown content={streaming.content} />
      ) : streaming.steps.length === 0 ? (
        <span className="inline-block h-3.5 w-1.5 rounded-sm bg-eg-navy eg-caret" />
      ) : null}
    </div>
  );
}

function focusSiteForRec(m: ChatMsg, sites: Site[]): Site | null {
  if (!m.recommendation) return null;
  return sites.find((s) => s.siteId === m.recommendation!.siteId) ?? null;
}

function buildRecMarkdown(rec: Recommendation, site: Site): string {
  const u = unitLabel(site.country);
  const notes = rec.perAgentNotes
    .map((n) => `- **${n.agent}**: ${n.note}`)
    .join("\n");
  return `**Recommended ${rec.gradeId} price: ${formatPrice(
    rec.recommendedPrice,
    site.currency
  )}${u}** ${
    rec.confidence != null ? `(${Math.round(rec.confidence * 100)}% confidence)` : ""
  }

${rec.rationale}

\`\`\`chart:metrics
Proj. volume | ${rec.projectedVolume != null ? `${rec.projectedVolume}/day` : "—"} | neutral
Proj. margin | ${rec.projectedMargin != null ? formatPrice(rec.projectedMargin, site.currency) : "—"} | good
Confidence | ${rec.confidence != null ? `${Math.round(rec.confidence * 100)}%` : "—"} | neutral
\`\`\`

**Agent panel**
${notes}`;
}

function RecommendationCard({ rec, site }: { rec: Recommendation; site: Site }) {
  return (
    <div className="mb-2 rounded-xl border-2 border-eg-navy bg-eg-surface-2 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-eg-ink-soft">
        Recommended {rec.gradeId} price
      </div>
      <div className="kpi-num text-2xl font-bold text-eg-navy">
        {formatPrice(rec.recommendedPrice, site.currency)}
        <span className="text-sm font-medium text-eg-ink-soft">
          {unitLabel(site.country)}
        </span>
      </div>
    </div>
  );
}
