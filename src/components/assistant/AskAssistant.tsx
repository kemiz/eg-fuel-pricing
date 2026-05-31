"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Sparkles,
  User,
  Bot,
  Square,
  CornerDownRight,
  RotateCcw,
  Loader2,
  Check,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import type { GradeId, Site } from "@/lib/types";
import type { AskBriefing } from "@/lib/data/server";
import { formatPrice, formatCompactMoney, unitLabel, cn } from "@/lib/utils";
import {
  AssistantMarkdown,
  EntityProvider,
  parseFollowUps,
  type EntityHandlers,
} from "./AssistantMessage";
import { AgentStepsInline, type AgentStep } from "./AgentSteps";
import { WelcomeBriefing, BriefingRail } from "./WelcomeBriefing";
import { useSim, type SimEventDTO } from "@/lib/sim/provider";
import {
  CalendarClock,
  TrendingUp,
  TrendingDown,
  MapPin,
  ChevronRight,
  Newspaper,
} from "lucide-react";
import { regionLabel } from "@/lib/geo";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: AgentStep[];
  recommendation?: Recommendation;
  /** A price change applied directly from chat (renders an applied card). */
  applied?: AppliedChange;
  /** A network-wide bulk apply of current recommendations. */
  bulkApplied?: BulkApplied;
  followUps?: string[];
  /** Simulated day index this message was sent on (for the inline day stamp). */
  simDay?: number;
}

/** A price change that was committed to the forecourt directly from the chat. */
interface AppliedChange {
  ok: boolean;
  siteId: string;
  siteName: string;
  gradeId: GradeId;
  currency: string;
  unit: string;
  price: number;
  oldPrice: number | null;
  unitCost: number | null;
  compAvg: number | null;
  /** Modelled daily volume at the site (for the margin-uplift estimate). */
  volume: number | null;
  /** Set when the change was rejected (e.g. below cost). */
  error?: string;
}

/** Result of a network-wide bulk apply of the current recommendations. */
interface BulkApplied {
  ok: boolean;
  gradeId: GradeId;
  rows: {
    siteId: string;
    siteName: string;
    oldPrice: number | null;
    newPrice: number;
    margin: number | null;
  }[];
  skipped: { siteName: string; reason: string }[];
  /** Currency/unit of the first applied site (network is single-currency per run). */
  currency: string;
  unit: string;
  error?: string;
}

/**
 * A non-message entry interleaved into the transcript: the simulated clock
 * rolled to a new day (optionally carrying the market events that fired that
 * day). Lets the conversation read as a live, time-aware feed.
 */
interface TimelineMark {
  id: string;
  kind: "day";
  /** Simulated day index this mark sits at (ordering key vs messages). */
  simDay: number;
  /** ISO date (YYYY-MM-DD) of the simulated day. */
  date: string;
  /** Market events that fired on this day, if any. */
  events: SimEventDTO[];
}

type TimelineItem =
  | ({ _t: "msg" } & ChatMsg)
  | ({ _t: "mark" } & TimelineMark);

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

/**
 * Turn a chat message into text for the LLM history. Action-bearing turns
 * (a committed single apply, a committed network-wide bulk apply, or a fresh
 * agent recommendation) carry their detail in structured fields, not in
 * `content` — so without this the model sees an empty assistant turn and, when
 * later asked "did you apply that?", wrongly answers "no". We synthesise a
 * compact factual summary so the model knows exactly what the PLATFORM already
 * committed and can answer follow-ups truthfully.
 */
function serializeForLLM(m: ChatMsg): string {
  if (m.applied?.ok) {
    const a = m.applied;
    const sym = a.currency === "USD" ? "$" : "£";
    return `[PLATFORM ACTION — COMMITTED] Applied ${a.gradeId} = ${sym}${a.price} at ${a.siteName}${
      a.oldPrice != null ? ` (was ${sym}${a.oldPrice})` : ""
    }. This price is now live on the forecourt.`;
  }
  if (m.bulkApplied?.ok) {
    const b = m.bulkApplied;
    const sym = b.currency === "USD" ? "$" : "£";
    const applied = b.rows.length;
    const ups = b.rows.filter((r) => r.oldPrice != null && r.newPrice > r.oldPrice).length;
    const downs = b.rows.filter((r) => r.oldPrice != null && r.newPrice < r.oldPrice).length;
    const sample = b.rows
      .slice(0, 4)
      .map((r) => `${r.siteName} ${sym}${r.newPrice}`)
      .join(", ");
    const skipped = b.skipped.length ? ` ${b.skipped.length} site(s) were skipped.` : "";
    return `[PLATFORM ACTION — COMMITTED] Network-wide bulk apply of ${b.gradeId}: repriced ${applied} site(s) (${ups} up, ${downs} down). These prices are now live on the forecourt. e.g. ${sample}.${skipped}`;
  }
  if (m.recommendation) {
    const r = m.recommendation;
    return `[AGENT RECOMMENDATION — NOT YET APPLIED] Recommended ${r.gradeId} = ${r.recommendedPrice} for site ${r.siteId}. ${m.content || r.rationale || ""}`.trim();
  }
  return m.content;
}

/** sessionStorage key prefix for persisted chat sessions. */
const CHAT_STORE_PREFIX = "eg-chat:";

function loadSession(key?: string): ChatMsg[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(CHAT_STORE_PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMsg[];
    if (!Array.isArray(parsed)) return [];
    // Drop a trailing assistant turn that never produced anything (e.g. a
    // stream aborted before the first token when navigating away) so we don't
    // resume into an empty bubble.
    while (parsed.length) {
      const last = parsed[parsed.length - 1];
      const blank =
        last.role === "assistant" &&
        !last.content &&
        !(last.steps && last.steps.length) &&
        !last.recommendation;
      if (!blank) break;
      parsed.pop();
    }
    // Advance the module-level id counter past any restored ids so freshly
    // generated message ids never collide with resumed ones (React keys).
    for (const m of parsed) {
      const n = Number(String(m.id).replace(/^m/, ""));
      if (Number.isFinite(n) && n > _id) _id = n;
    }
    return parsed;
  } catch {
    return [];
  }
}

export function AskAssistant({
  sites,
  suggestions,
  focusSite,
  initialQuery,
  compact,
  fill,
  briefing,
  persistKey,
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
  /**
   * When set, the conversation is persisted to sessionStorage under this key so
   * it survives navigation / tab switches and can be resumed. Each distinct
   * surface (page or sub-tab) should pass its own stable key.
   */
  persistKey?: string;
}) {
  const router = useRouter();
  const sim = useSim();
  // Start empty so the FIRST client render matches the server (which has no
  // access to sessionStorage). The persisted conversation is then restored in
  // an effect after mount — restoring it during the initial render instead
  // would cause a hydration mismatch. `hydrated` gates the persist effect so
  // the empty initial state can't clobber a saved session before it loads.
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  // Day-change marks interleaved into the transcript as the sim clock advances.
  const [marks, setMarks] = useState<TimelineMark[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // Collapse state for the right market-timeline rail. Lifted here (rather than
  // local to the rail) so the left spacer can mirror the rail's current width
  // and keep the chat column centered in every state.
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [streaming, setStreaming] = useState<{ content: string; steps: AgentStep[] } | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore any persisted conversation once, after the first client render.
  useEffect(() => {
    const restored = loadSession(persistKey);
    if (restored.length) setMessages(restored);
    setHydrated(true);
    // Only re-run if the persistence key changes (distinct surface).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  // Persist the conversation (finalised messages only) so it can be resumed.
  // Skip until after hydration so the empty initial state never overwrites a
  // saved session on first render.
  useEffect(() => {
    if (!hydrated || !persistKey || typeof window === "undefined") return;
    const storeKey = CHAT_STORE_PREFIX + persistKey;
    try {
      if (messages.length === 0) window.sessionStorage.removeItem(storeKey);
      else window.sessionStorage.setItem(storeKey, JSON.stringify(messages));
    } catch {
      // Storage may be unavailable (private mode / quota) — fail silently.
    }
  }, [messages, persistKey, hydrated]);

  const siteIndex = useRef(sites);
  useEffect(() => {
    siteIndex.current = sites;
  }, [sites]);

  // Live timeline: when the simulated clock rolls to a new day, drop a day
  // marker (with that day's market events) into the transcript so the chat is
  // time-aware. Only accrue marks once a conversation has started — there's no
  // value stamping days onto the empty welcome screen. Marks are capped so a
  // long idle run can't grow the transcript without bound.
  const simDay = sim.state?.dayIndex ?? null;
  const simDate = sim.state?.simDate ?? null;
  const lastMarkDay = useRef<number | null>(null);
  const hasConvoRef = useRef(false);
  useEffect(() => {
    hasConvoRef.current = messages.length > 0;
  }, [messages.length]);
  useEffect(() => {
    if (simDay == null || simDate == null) return;
    // Seed the baseline on first observation so we only mark FORWARD changes.
    if (lastMarkDay.current == null) {
      lastMarkDay.current = simDay;
      return;
    }
    if (simDay <= lastMarkDay.current) return; // no forward change (or a reset)
    const from = lastMarkDay.current;
    lastMarkDay.current = simDay;
    if (!hasConvoRef.current) return; // don't stamp days onto the empty state
    // One mark per advanced day (handles multi-day jumps), each carrying the
    // events the provider knows fired on that day.
    setMarks((prev) => {
      const next = [...prev];
      for (let d = from + 1; d <= simDay; d++) {
        if (next.some((mk) => mk.simDay === d)) continue;
        const dayEvents = sim.events.filter((e) => e.dayIndex === d);
        const date =
          d === simDay
            ? simDate
            : sim.events.find((e) => e.dayIndex === d)?.day ?? simDate;
        next.push({ id: `d${d}`, kind: "day", simDay: d, date, events: dayEvents });
      }
      return next.slice(-60);
    });
  }, [simDay, simDate, sim.events]);

  // A reset (dayIndex drops back to baseline) clears the interleaved marks so
  // the transcript doesn't show stale future days.
  useEffect(() => {
    if (simDay != null && lastMarkDay.current != null && simDay < lastMarkDay.current) {
      lastMarkDay.current = simDay;
      setMarks([]);
    }
  }, [simDay]);

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
      router.push(`/analytics?tab=map&region=${encodeURIComponent(region)}`),
  };

  /** Resolve a site from free text (used by the apply + optimise intents).
   *  Tries the full name first, then a distinctive location token (e.g. the
   *  city in "Turkey Hill Lancaster" so "apply $3.72 to Lancaster" matches),
   *  then brand+region. Picks the longest unique token match to avoid clashes. */
  const resolveSite = useCallback((text: string): Site | null => {
    const q = text.toLowerCase();
    const exact = siteIndex.current.find((s) => q.includes(s.name.toLowerCase()));
    if (exact) return exact;

    // Distinctive token (>=4 chars) from each site's name that appears in the
    // text. Skip generic brand words so they don't false-match across sites.
    const STOP = new Set([
      "stop", "shop", "mart", "fuel", "gas", "station", "service", "express",
      "petrol", "filling", "garage", "energy", "stores", "store",
    ]);
    let best: { site: Site; len: number } | null = null;
    for (const s of siteIndex.current) {
      for (const tok of s.name.toLowerCase().split(/[^a-z0-9]+/)) {
        if (tok.length < 4 || STOP.has(tok)) continue;
        if (q.includes(tok) && (!best || tok.length > best.len)) {
          best = { site: s, len: tok.length };
        }
      }
    }
    if (best) return best.site;

    return (
      siteIndex.current.find(
        (s) =>
          q.includes(s.brand.toLowerCase()) &&
          (s.region ? q.includes(s.region.toLowerCase()) : false)
      ) ?? null
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
        // Mirror progress into the message so it persists if the user navigates
        // away mid-run (the bubble keeps the steps reached so far).
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId ? { ...msg, steps: [...steps] } : msg
          )
        );
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
        // On abort (navigated away mid-run) keep the agent steps captured so
        // far so the message isn't left blank.
        if ((e as Error).name === "AbortError") {
          steps.forEach((s) => {
            if (s.status === "active") s.status = "done";
          });
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    content:
                      msg.content ||
                      "_Pricing run interrupted — ask again to resume._",
                    steps: [...steps],
                  }
                : msg
            )
          );
          return;
        }
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
            messages: history.map((m) => ({
              role: m.role,
              content: serializeForLLM(m),
            })),
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
                // Mirror the partial into the message itself so it's persisted
                // and survives an unmount (tab/page switch) mid-stream.
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === assistantId ? { ...msg, content: acc } : msg
                  )
                );
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
        // On abort (e.g. the user navigated away mid-stream) keep whatever was
        // generated so far rather than discarding it / leaving an empty bubble.
        if ((e as Error).name === "AbortError") {
          if (acc) {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: acc, followUps: parseFollowUps(acc) }
                  : msg
              )
            );
          }
          return;
        }
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

  /* --------------------- apply a price directly from chat ----------------- */
  const runApply = useCallback(
    async (site: Site, gradeId: GradeId, price: number, assistantId: string) => {
      try {
        const res = await fetch("/api/pricing/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: site.siteId, gradeId, price, source: "manual" }),
        });
        const data = await res.json();
        if (!res.ok) {
          // Surface a rejection (e.g. below cost) as a failed applied card.
          const applied: AppliedChange = {
            ok: false,
            siteId: site.siteId,
            siteName: data.siteName ?? site.name,
            gradeId,
            currency: site.currency,
            unit: site.unit,
            price,
            oldPrice: null,
            unitCost: data.unitCost ?? null,
            compAvg: null,
            volume: null,
            error: data.error ?? `Couldn't apply (${res.status}).`,
          };
          setMessages((m) =>
            m.map((msg) => (msg.id === assistantId ? { ...msg, applied } : msg))
          );
          return;
        }
        const applied: AppliedChange = {
          ok: true,
          siteId: site.siteId,
          siteName: data.siteName ?? site.name,
          gradeId,
          currency: site.currency,
          unit: site.unit,
          price: Number(data.price),
          oldPrice: data.oldPrice ?? null,
          unitCost: data.unitCost ?? null,
          compAvg: data.compAvg ?? null,
          volume: data.volume ?? null,
        };
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  applied,
                  followUps: [
                    `How is ${site.name} performing now?`,
                    "Run pricing agents on this site",
                    "Which other sites have pricing headroom?",
                  ],
                }
              : msg
          )
        );
        // Repaint server components (map, analytics, site page) with the change.
        router.refresh();
      } catch (e) {
        const applied: AppliedChange = {
          ok: false,
          siteId: site.siteId,
          siteName: site.name,
          gradeId,
          currency: site.currency,
          unit: site.unit,
          price,
          oldPrice: null,
          unitCost: null,
          compAvg: null,
          volume: null,
          error: (e as Error).message,
        };
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, applied } : msg))
        );
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  /* ----- bulk-apply the current network recommendations (REAL, not narrated) ----- */
  const runApplyAll = useCallback(
    async (gradeId: GradeId, assistantId: string) => {
      const currency = sites[0]?.currency ?? "USD";
      const unit = sites[0]?.unit ?? "gal";
      try {
        const res = await fetch("/api/pricing/apply-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grade: gradeId }),
        });
        const data = await res.json();
        if (!res.ok) {
          const bulkApplied: BulkApplied = {
            ok: false,
            gradeId,
            rows: [],
            skipped: [],
            currency,
            unit,
            error: data.error ?? `Couldn't apply (${res.status}).`,
          };
          setMessages((m) =>
            m.map((msg) => (msg.id === assistantId ? { ...msg, bulkApplied } : msg))
          );
          return;
        }
        const bulkApplied: BulkApplied = {
          ok: true,
          gradeId,
          rows: (data.applied ?? []).map(
            (r: {
              siteId: string;
              siteName: string;
              oldPrice: number | null;
              newPrice: number;
              margin: number | null;
            }) => ({
              siteId: r.siteId,
              siteName: r.siteName,
              oldPrice: r.oldPrice,
              newPrice: r.newPrice,
              margin: r.margin,
            })
          ),
          skipped: (data.skipped ?? []).map(
            (s: { siteName: string; reason: string }) => ({
              siteName: s.siteName,
              reason: s.reason,
            })
          ),
          currency,
          unit,
        };
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  bulkApplied,
                  followUps: [
                    "How is the network performing now?",
                    "Show the interventions log",
                    "Which sites still have headroom?",
                  ],
                }
              : msg
          )
        );
        router.refresh();
      } catch (e) {
        const bulkApplied: BulkApplied = {
          ok: false,
          gradeId,
          rows: [],
          skipped: [],
          currency,
          unit,
          error: (e as Error).message,
        };
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, bulkApplied } : msg))
        );
      } finally {
        setBusy(false);
      }
    },
    [router, sites]
  );

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      setBusy(true);

      const day = sim.state?.dayIndex;
      const userMsg: ChatMsg = { id: nextId(), role: "user", content: text, simDay: day };
      const assistantId = nextId();
      const assistantMsg: ChatMsg = {
        id: assistantId,
        role: "assistant",
        content: "",
        simDay: day,
      };
      const history = [...messages, userMsg];
      setMessages([...history, assistantMsg]);

      const isQuestion = /\b(why|which|what|how|where|compare|break (it |this )?down|explain|show|list|rank)\b/i.test(
        text
      );
      const grade: GradeId = /premium/i.test(text)
        ? "premium"
        : /diesel/i.test(text)
          ? "diesel"
          : "regular";

      // Intent 0: BULK apply — "apply all", "apply these recommendations",
      // "reprice the network", "apply all five prices", etc. The platform really
      // commits each current recommendation (and logs interventions); we never
      // let the LLM narrate a fake bulk apply. Detect this BEFORE the single-site
      // apply so "apply all" isn't misread as a one-site action.
      const wantsApplyAll =
        /\b(apply|commit|push|reprice|roll out|execute)\b/i.test(text) &&
        /\b(all|every|each|these|those|the (recommendation|recommended|recs|changes|prices)|network[- ]wide|across the network|all five|all \d+)\b/i.test(
          text
        ) &&
        !isQuestion;
      if (wantsApplyAll) {
        void runApplyAll(grade, assistantId);
        return;
      }

      // Intent 1: APPLY a specific price directly ("apply $3.72 to Lancaster",
      // "set regular to 1.45 at <site>", "change Lancaster to $3.72"). We commit
      // it ourselves rather than describing how — the platform has write access.
      const wantsApply =
        /\b(apply|set|change|update|push|commit|make it)\b/i.test(text) &&
        !isQuestion;
      const priceMatch = text.match(/(?:[$£]\s*)?(\d+(?:\.\d{1,3}))\b/);
      const applySite = wantsApply ? focusSite ?? resolveSite(text) : null;
      if (applySite && priceMatch) {
        const price = Number(priceMatch[1]);
        if (Number.isFinite(price) && price > 0) {
          void runApply(applySite, grade, price, assistantId);
          return;
        }
      }

      // Intent 2: only run the multi-agent pricing flow on an explicit request
      // to GENERATE a new price ("optimise…", "run the agents", "recommend a
      // price for…"). Analytical questions always go to conversational Q&A.
      const wantsOptimise =
        /\b(optimi[sz]e|run the (pricing )?agents|recommend a (new )?price)\b/i.test(
          text
        ) && !isQuestion;
      // Resolve the target site: explicit focus / a site named in the text, then
      // fall back to the site of the most recent recommendation or applied
      // change in this conversation. This makes follow-ups like "Optimise the
      // premium grade too" (which name no site) re-run the agents on the SAME
      // site as the last recommendation, for the requested grade — instead of
      // dropping to plain chat that wrongly claims it has no premium data.
      const lastSiteId = [...messages]
        .reverse()
        .map((m) => m.recommendation?.siteId ?? m.applied?.siteId)
        .find((id): id is string => !!id);
      const site = wantsOptimise
        ? focusSite ??
          resolveSite(text) ??
          (lastSiteId
            ? siteIndex.current.find((s) => s.siteId === lastSiteId) ?? null
            : null)
        : null;
      if (site) {
        void runAgents(site, grade, assistantId);
      } else {
        void runChat(history, assistantId);
      }
    },
    [busy, messages, focusSite, resolveSite, runApply, runApplyAll, runAgents, runChat, sim.state?.dayIndex]
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

  /** Clear the conversation and any persisted session, back to a fresh chat. */
  function resetChat() {
    abortRef.current?.abort();
    setStreaming(null);
    setBusy(false);
    setMessages([]);
    setMarks([]);
    // Re-baseline so day markers start accruing from the current sim day for
    // the next conversation rather than replaying days already passed.
    lastMarkDay.current = sim.state?.dayIndex ?? null;
    setInput("");
    if (persistKey && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(CHAT_STORE_PREFIX + persistKey);
      } catch {
        // ignore
      }
    }
  }

  const empty = messages.length === 0 && !streaming;
  const hasConversation = messages.length > 0 || streaming != null;

  // Merge messages and day-marks into one chronological transcript. Messages
  // keep their exact ARRIVAL order; each day marker is slotted in just before
  // the first message that belongs to its day or later. Markers whose day is
  // beyond every message (e.g. days passing while idle) append at the end.
  const timeline = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];
    const sortedMarks = [...marks].sort((a, b) => a.simDay - b.simDay);
    let mi = 0;
    const flushMarksUpTo = (msgDay: number | null) => {
      // Emit any pending marks whose day is <= this message's day (undated
      // messages — msgDay null — never pull marks forward; those marks trail).
      while (
        mi < sortedMarks.length &&
        msgDay != null &&
        sortedMarks[mi].simDay <= msgDay
      ) {
        out.push({ _t: "mark", ...sortedMarks[mi++] });
      }
    };
    for (const m of messages) {
      flushMarksUpTo(m.simDay ?? null);
      out.push({ _t: "msg", ...m });
    }
    // Trailing marks (days advanced after the last message, or while idle).
    while (mi < sortedMarks.length) out.push({ _t: "mark", ...sortedMarks[mi++] });
    return out;
  }, [messages, marks]);

  const lastMsgId = messages[messages.length - 1]?.id;
  // When embedded on a site page, every starter prompt is scoped to that site;
  // otherwise fall back to network-level prompts.
  const defaultSuggestions =
    suggestions ??
    (focusSite
      ? [
          `How is ${focusSite.name} priced vs its local competitors?`,
          `What's driving the margin at ${focusSite.name}?`,
          `Optimise the regular price for ${focusSite.name}`,
          `Should we change ${focusSite.name}'s price this week?`,
        ]
      : [
          "Which regions have the best margins?",
          "Where are we priced above our competitors?",
          "Show me the network split: cheaper vs dearer than rivals",
          "Optimise the regular price for Cumberland Farms Orlando",
        ]);

  // Once a conversation starts, the welcome cards don't vanish — on the wide
  // (home) layout they dock into rails flanking the chat: snapshot on the left,
  // focus on the right. Skip rails on the narrow site column (focusSite) and in
  // compact embeds where there isn't room.
  const showRails = Boolean(briefing) && !empty && !focusSite && !compact;
  // All metric cards (snapshot + focus) live together in a SINGLE scrollable
  // rail on the left, rather than flanking the chat on both sides.
  const snapshotCards = briefing?.snapshot ?? [];
  const focusCards = briefing?.focus ?? [];
  // The market timeline lives on the right of the chat on the standalone Ask EG
  // home layout only — gated on `briefing` so it never appears when the
  // assistant is EMBEDDED inside Analytics or a site page (where it would
  // overlap the host page's own content). Unlike the briefing rails it stays
  // visible even before a conversation starts, since the market story is useful
  // context to open with.
  const showTimeline = Boolean(briefing) && !focusSite && !compact;

  return (
    <EntityProvider handlers={entityHandlers}>
      <div
        className="relative flex min-h-0 flex-row gap-5"
        style={fill ? { height: "100%" } : { height: compact ? 520 : 640 }}
      >
        {showRails ? (
          <aside className="eg-scroll hidden w-64 shrink-0 space-y-5 overflow-y-auto pb-4 pt-1 xl:block 2xl:w-72">
            <BriefingRail
              label="Network snapshot"
              cards={snapshotCards}
              onAsk={(p) => submit(p)}
              indexOffset={0}
            />
            <BriefingRail
              label="Worth a look"
              cards={focusCards}
              onAsk={(p) => submit(p)}
              indexOffset={snapshotCards.length}
            />
          </aside>
        ) : (
          // Spacer mirroring the right timeline rail's CURRENT width so the chat
          // stays centered even when the left briefing rail isn't shown (e.g. the
          // empty state). Matches the thin collapsed tab when the rail is hidden.
          showTimeline && (
            <div
              className={cn(
                "hidden shrink-0 xl:block",
                timelineCollapsed ? "w-9" : "w-64 2xl:w-72"
              )}
            />
          )
        )}

        {/* Center: the chat column owns the (centered) input composer. */}
        <div className="relative flex min-w-0 flex-1 flex-col">
        {hasConversation && (
          <button
            type="button"
            onClick={resetChat}
            title="Start a new chat"
            className="eg-chip absolute right-1 top-1 z-10 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-eg-ink-soft hover:text-eg-navy"
          >
            <RotateCcw size={12} /> New chat
          </button>
        )}
        <div
          ref={scrollRef}
          className="eg-scroll eg-fade-bottom flex-1 space-y-4 overflow-y-auto px-1 pb-28 pt-1"
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
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-eg-navy to-eg-navy-700 text-white shadow-lg shadow-eg-navy/30">
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
                    className="eg-chip rounded-full px-3 py-1.5 text-xs text-eg-ink-soft hover:text-eg-navy"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {timeline.map((it) => {
            if (it._t === "mark") {
              return <DayMark key={it.id} mark={it} />;
            }
            const m = it;
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end gap-2">
                  <div className="flex max-w-[80%] flex-col items-end">
                    <div className="rounded-2xl rounded-br-sm bg-gradient-to-br from-eg-navy to-eg-navy-700 px-3.5 py-2 text-sm text-white shadow-md shadow-eg-navy/25">
                      {m.content}
                    </div>
                    <DayStamp simDay={m.simDay} />
                  </div>
                  <div className="eg-tile mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-eg-ink-soft">
                    <User size={14} />
                  </div>
                </div>
              );
            }
            const isStreamingThis =
              streaming &&
              m.id === lastMsgId &&
              !m.content &&
              !m.applied &&
              !m.bulkApplied;
            return (
              <div key={m.id} className="flex justify-start gap-2">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-eg-navy to-eg-navy-700 text-white shadow-md shadow-eg-navy/25">
                  <Bot size={14} />
                </div>
                <div className="min-w-0 max-w-[85%] space-y-2">
                  {isStreamingThis ? (
                    <StreamingBubble streaming={streaming} />
                  ) : m.applied ? (
                    <>
                      <AppliedCard applied={m.applied} />
                      {m.followUps && m.followUps.length > 0 && !busy && (
                        <FollowUpChips items={m.followUps} onAsk={submit} />
                      )}
                    </>
                  ) : m.bulkApplied ? (
                    <>
                      <BulkAppliedCard bulk={m.bulkApplied} />
                      {m.followUps && m.followUps.length > 0 && !busy && (
                        <FollowUpChips items={m.followUps} onAsk={submit} />
                      )}
                    </>
                  ) : (
                    <>
                      <div className="eg-tile rounded-2xl rounded-bl-sm px-3.5 py-2.5">
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
          className="absolute inset-x-0 bottom-0 px-1 pb-1"
        >
          <div className="eg-glass-input mx-auto flex max-w-2xl items-end gap-2 rounded-2xl p-2 transition-colors">
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
              className="max-h-32 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-eg-ink-soft"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-eg-surface-2 text-eg-ink-soft transition-colors hover:bg-eg-line"
                aria-label="Stop"
              >
                <Square size={15} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-eg-red to-eg-red-600 text-white shadow-md shadow-eg-red/25 transition-all hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
                aria-label="Send"
              >
                <Send size={15} />
              </button>
            )}
          </div>
        </form>
        </div>

        {showTimeline && (
          <MarketTimelineRail
            events={sim.events}
            sites={sites}
            currentDay={simDay}
            onAsk={(p) => submit(p)}
            collapsed={timelineCollapsed}
            onToggle={setTimelineCollapsed}
          />
        )}
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
          className="eg-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-eg-ink-soft hover:text-eg-navy"
        >
          <CornerDownRight size={11} /> {q}
        </button>
      ))}
    </div>
  );
}

function fmtSimDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Small "Day N" stamp under a message bubble. */
function DayStamp({ simDay }: { simDay?: number }) {
  if (simDay == null) return null;
  return (
    <span className="mt-1 select-none px-1 text-[10px] font-medium text-eg-ink-soft/70">
      Day {simDay}
    </span>
  );
}

/** Inline divider marking a new simulated day, with that day's market events. */
function DayMark({ mark }: { mark: TimelineMark }) {
  return (
    <div className="eg-flash-neutral my-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-eg-line" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-eg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-eg-ink-soft">
          <CalendarClock size={12} />
          Day {mark.simDay} · {fmtSimDate(mark.date)}
        </span>
        <div className="h-px flex-1 bg-eg-line" />
      </div>
      {mark.events.length > 0 && (
        <div className="mx-auto flex max-w-md flex-col gap-1">
          {mark.events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: SimEventDTO }) {
  const tone = event.tone;
  const Icon =
    tone === "good" ? TrendingUp : tone === "bad" ? TrendingDown : AlertTriangle;
  const toneCls =
    tone === "good"
      ? "text-eg-green"
      : tone === "bad"
        ? "text-eg-red"
        : "text-eg-ink-soft";
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-eg-ink-soft">
      <Icon size={12} className={cn("shrink-0", toneCls)} />
      <span className="truncate">{event.headline}</span>
    </div>
  );
}

/** Human label for an event's kind, mirroring the analytics event log. */
const EVENT_KIND_LABEL: Record<string, string> = {
  crude_spike: "Crude spike",
  price_war: "Price war",
  outage: "Supply outage",
  demand_swing: "Demand swing",
};

/**
 * Build a chat prompt from a clicked timeline event so the rail seeds a
 * grounded question for the assistant instead of being read-only.
 */
function eventToPrompt(event: SimEventDTO, where: string | null): string {
  const scope = where ? ` affecting ${where}` : "";
  return `On day ${event.dayIndex} a "${event.headline}" event fired${scope}. What's the impact on our pricing and margins, and how should we respond?`;
}

/**
 * Right-hand market timeline beside the chat. Groups the simulated market
 * events by day (newest first, like the analytics event log) and lets the
 * operator click any event to ask the assistant about it. Recent and adverse
 * events get an alert-style accent (the hybrid timeline/notification feel).
 */
function MarketTimelineRail({
  events,
  sites,
  currentDay,
  onAsk,
  collapsed,
  onToggle,
}: {
  events: SimEventDTO[];
  sites: Site[];
  currentDay: number | null;
  onAsk: (prompt: string) => void;
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
}) {
  const siteById = useMemo(() => {
    const m = new Map<string, Site>();
    for (const s of sites) m.set(s.siteId, s);
    return m;
  }, [sites]);

  // Group newest-day-first; events already arrive newest-first from the sim.
  const days = useMemo(() => {
    const byDay = new Map<number, SimEventDTO[]>();
    for (const e of events) {
      const arr = byDay.get(e.dayIndex);
      if (arr) arr.push(e);
      else byDay.set(e.dayIndex, [e]);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([dayIndex, evs]) => ({ dayIndex, date: evs[0]?.day, events: evs }));
  }, [events]);

  const where = (e: SimEventDTO): string | null => {
    if (e.scope === "site" && e.ref) {
      const s = siteById.get(e.ref);
      return s ? `${s.name} (${s.brand})` : null;
    }
    if (e.scope === "region" && e.ref) {
      // ref is a region code; resolve against any site in that region for country.
      const s = sites.find((x) => x.region === e.ref);
      return s ? regionLabel(s.country, e.ref) : e.ref;
    }
    if (e.scope === "network") return "the network";
    return null;
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onToggle(false)}
        title="Show market timeline"
        className="eg-chip hidden h-full w-9 shrink-0 flex-col items-center justify-start gap-2 rounded-xl pt-3 text-eg-ink-soft hover:text-eg-navy xl:flex"
      >
        <Newspaper size={15} />
        <span className="[writing-mode:vertical-rl] text-[10px] font-semibold uppercase tracking-wider">
          Market timeline
        </span>
      </button>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col xl:flex 2xl:w-72">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-eg-ink-soft">
          <Newspaper size={13} /> Market timeline
        </span>
        <button
          type="button"
          onClick={() => onToggle(true)}
          title="Hide timeline"
          className="rounded-md p-0.5 text-eg-ink-soft hover:text-eg-navy"
          aria-label="Hide market timeline"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="eg-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 pr-0.5">
        {days.length === 0 ? (
          <p className="px-1 text-[11px] leading-relaxed text-eg-ink-soft">
            No market events yet — crude, demand and competitor shocks will
            appear here as they happen.
          </p>
        ) : (
          days.map(({ dayIndex, date, events: dayEvents }) => {
            const isLatest = currentDay != null && dayIndex === currentDay;
            return (
              <div key={dayIndex} className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <CalendarClock size={12} className="shrink-0 text-eg-ink-soft" />
                  <span className="text-[11px] font-semibold text-eg-ink">
                    Day {dayIndex} · {fmtSimDate(date)}
                  </span>
                  {isLatest && (
                    <span className="rounded-full bg-eg-navy/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-eg-navy">
                      Today
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {dayEvents.map((e) => {
                    const Icon =
                      e.tone === "good"
                        ? TrendingUp
                        : e.tone === "bad"
                          ? TrendingDown
                          : AlertTriangle;
                    const toneCls =
                      e.tone === "good"
                        ? "text-eg-green"
                        : e.tone === "bad"
                          ? "text-eg-red"
                          : "text-eg-ink-soft";
                    const place = where(e);
                    // Hybrid alert accent: adverse events (and especially today's)
                    // read like notifications, not just log lines.
                    const alert = e.tone === "bad";
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => onAsk(eventToPrompt(e, place))}
                        title={e.detail || "Ask the assistant about this event"}
                        className={cn(
                          "group flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors",
                          alert
                            ? "border-eg-red/30 bg-eg-red/5 hover:bg-eg-red/10"
                            : "border-transparent hover:border-eg-line hover:bg-eg-surface-2"
                        )}
                      >
                        <Icon size={13} className={cn("mt-0.5 shrink-0", toneCls)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-medium leading-snug text-eg-ink">
                            {e.headline}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-eg-ink-soft">
                            <span className="rounded bg-eg-surface-2 px-1 py-px font-medium">
                              {EVENT_KIND_LABEL[e.kind] ?? e.kind}
                            </span>
                            {place && e.scope !== "network" && (
                              <span className="inline-flex items-center gap-0.5">
                                <MapPin size={9} /> {place}
                              </span>
                            )}
                          </span>
                        </span>
                        <ChevronRight
                          size={13}
                          className="mt-0.5 shrink-0 text-eg-ink-soft/0 transition-colors group-hover:text-eg-ink-soft"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function StreamingBubble({
  streaming,
}: {
  streaming: { content: string; steps: AgentStep[] };
}) {
  return (
    <div className="eg-tile rounded-2xl rounded-bl-sm px-3.5 py-2.5">
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
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function applyPrice() {
    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/pricing/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: rec.siteId,
          gradeId: rec.gradeId,
          price: rec.recommendedPrice,
          source: "recommendation",
          projectedMargin: rec.projectedMargin,
          projectedVolume: rec.projectedVolume,
          confidence: rec.confidence,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? `Failed (${res.status})`);
        return;
      }
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    }
  }

  return (
    <div className="eg-tile mb-2 rounded-xl border-2 border-eg-navy/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
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
        <button
          type="button"
          onClick={applyPrice}
          disabled={status === "saving" || status === "saved"}
          className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-lg bg-gradient-to-br from-eg-red to-eg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-eg-red/25 transition-all hover:brightness-110 disabled:cursor-default disabled:opacity-70 disabled:shadow-none"
        >
          {status === "saving" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : status === "saved" ? (
            <Check size={14} />
          ) : (
            <CheckCircle2 size={14} />
          )}
          {status === "saved" ? "Applied" : status === "saving" ? "Applying…" : "Apply price"}
        </button>
      </div>
      {status === "saved" && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-eg-green">
          <Check size={12} className="shrink-0" />
          Applied to {site.name} — now live on the forecourt.
        </div>
      )}
      {status === "error" && message && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-eg-red">
          <AlertTriangle size={12} className="shrink-0" />
          {message}
        </div>
      )}
    </div>
  );
}

/**
 * Confirmation card for a price applied directly from chat. Reads as a live
 * forecourt action: the new price, what it replaced, a quick cost/competitor
 * sanity check, and an estimated daily margin impact. No "simulation" framing —
 * the change is live the moment it's shown.
 */
function AppliedCard({ applied: a }: { applied: AppliedChange }) {
  const dp = a.currency === "GBP" ? 3 : 2;
  const symbol = a.currency === "USD" ? "$" : "£";
  const fmt = (v: number) => `${symbol}${v.toFixed(dp)}`;

  if (!a.ok) {
    return (
      <div className="eg-tile rounded-2xl rounded-bl-sm border-2 border-eg-red/50 px-3.5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-eg-red">
          <AlertTriangle size={16} className="shrink-0" />
          Couldn’t apply {fmt(a.price)} to {a.siteName}
        </div>
        <p className="mt-1.5 text-xs text-eg-ink-soft">{a.error}</p>
      </div>
    );
  }

  const margin = a.unitCost != null ? a.price - a.unitCost : null;
  const vsComp = a.compAvg != null ? a.price - a.compAvg : null;
  const vsPrev = a.oldPrice != null ? a.price - a.oldPrice : null;
  // Daily margin impact of the move vs the price it replaced.
  const dailyImpact =
    vsPrev != null && a.volume != null ? vsPrev * a.volume : null;

  const gradeLabel = a.gradeId.charAt(0).toUpperCase() + a.gradeId.slice(1);

  return (
    <div className="eg-tile rounded-2xl rounded-bl-sm border-2 border-eg-green/50 p-3.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-eg-green/15 text-eg-green-600">
          <CheckCircle2 size={16} />
        </span>
        <div>
          <div className="text-sm font-semibold text-eg-ink">
            {gradeLabel} now {fmt(a.price)}
            <span className="text-xs font-normal text-eg-ink-soft">
              {a.unit ? `/${a.unit}` : ""}
            </span>{" "}
            at {a.siteName}
          </div>
          <div className="text-[11px] text-eg-green-600">
            Live on the forecourt
            {vsPrev != null && Math.abs(vsPrev) >= 10 ** -dp
              ? ` — ${vsPrev > 0 ? "up" : "down"} ${fmt(Math.abs(vsPrev))} from ${fmt(
                  a.oldPrice!
                )}`
              : ""}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <AppliedStat
          label="Unit margin"
          value={margin != null ? fmt(margin) : "—"}
          tone={margin != null && margin > 0 ? "good" : "neutral"}
        />
        <AppliedStat
          label="vs local rivals"
          value={
            vsComp == null
              ? "—"
              : Math.abs(vsComp) < 10 ** -dp
                ? "In line"
                : `${vsComp > 0 ? "+" : "−"}${fmt(Math.abs(vsComp))}`
          }
          tone={
            vsComp == null
              ? "neutral"
              : vsComp <= 0
                ? "good"
                : vsComp <= (a.currency === "USD" ? 0.05 : 0.02)
                  ? "neutral"
                  : "bad"
          }
        />
        <AppliedStat
          label="Est. margin/day"
          value={
            dailyImpact == null
              ? "—"
              : `${dailyImpact >= 0 ? "+" : "−"}${formatCompactMoney(
                  Math.abs(dailyImpact),
                  a.currency
                )}`
          }
          tone={dailyImpact == null ? "neutral" : dailyImpact >= 0 ? "good" : "bad"}
        />
      </div>
    </div>
  );
}

function AppliedStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  const toneText =
    tone === "good"
      ? "text-eg-green-600"
      : tone === "bad"
        ? "text-eg-red"
        : "text-eg-ink";
  return (
    <div className="rounded-lg bg-eg-surface-2/60 px-2.5 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-eg-ink-soft">
        {label}
      </div>
      <div className={cn("kpi-num mt-0.5 text-sm font-bold", toneText)}>{value}</div>
    </div>
  );
}

/** Confirmation card for a committed network-wide reprice from the chat. */
function BulkAppliedCard({ bulk: b }: { bulk: BulkApplied }) {
  const dp = b.currency === "GBP" ? 3 : 2;
  const symbol = b.currency === "USD" ? "$" : "£";
  const fmt = (v: number) => `${symbol}${v.toFixed(dp)}`;
  const gradeLabel = b.gradeId.charAt(0).toUpperCase() + b.gradeId.slice(1);

  if (!b.ok) {
    return (
      <div className="eg-tile rounded-2xl rounded-bl-sm border-2 border-eg-red/50 px-3.5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-eg-red">
          <AlertTriangle size={16} className="shrink-0" />
          Couldn’t reprice the network
        </div>
        <p className="mt-1.5 text-xs text-eg-ink-soft">{b.error}</p>
      </div>
    );
  }

  const applied = b.rows.length;
  if (applied === 0) {
    return (
      <div className="eg-tile rounded-2xl rounded-bl-sm border-2 border-eg-line px-3.5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-eg-ink">
          <CheckCircle2 size={16} className="shrink-0 text-eg-ink-soft" />
          Nothing to apply on {gradeLabel}
        </div>
        <p className="mt-1.5 text-xs text-eg-ink-soft">
          Every site already matches its latest recommendation.
        </p>
      </div>
    );
  }

  const ups = b.rows.filter(
    (r) => r.oldPrice != null && r.newPrice > r.oldPrice
  ).length;
  const downs = b.rows.filter(
    (r) => r.oldPrice != null && r.newPrice < r.oldPrice
  ).length;
  const preview = b.rows.slice(0, 5);
  const more = applied - preview.length;

  return (
    <div className="eg-tile rounded-2xl rounded-bl-sm border-2 border-eg-green/50 p-3.5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-eg-green/15 text-eg-green-600">
          <CheckCircle2 size={16} />
        </span>
        <div>
          <div className="text-sm font-semibold text-eg-ink">
            {gradeLabel} repriced across {applied}{" "}
            {applied === 1 ? "site" : "sites"}
          </div>
          <div className="text-[11px] text-eg-green-600">
            Live on the forecourt
            {ups > 0 || downs > 0
              ? ` — ${ups} up, ${downs} down${
                  applied - ups - downs > 0
                    ? `, ${applied - ups - downs} unchanged`
                    : ""
                }`
              : ""}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {preview.map((r) => {
          const vsPrev =
            r.oldPrice != null ? r.newPrice - r.oldPrice : null;
          return (
            <div
              key={r.siteId}
              className="flex items-center justify-between gap-2 rounded-lg bg-eg-surface-2/60 px-2.5 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate font-medium text-eg-ink">
                {r.siteName}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                {r.oldPrice != null && (
                  <span className="text-eg-ink-soft">{fmt(r.oldPrice)}</span>
                )}
                <span className="text-eg-ink-soft">→</span>
                <span className="font-semibold text-eg-ink">{fmt(r.newPrice)}</span>
                {vsPrev != null && Math.abs(vsPrev) >= 10 ** -dp && (
                  <span
                    className={cn(
                      "font-medium",
                      vsPrev > 0 ? "text-eg-green-600" : "text-eg-red"
                    )}
                  >
                    {vsPrev > 0 ? "+" : "−"}
                    {fmt(Math.abs(vsPrev))}
                  </span>
                )}
              </span>
            </div>
          );
        })}
        {more > 0 && (
          <div className="px-1 pt-0.5 text-[11px] text-eg-ink-soft">
            +{more} more {more === 1 ? "site" : "sites"}
          </div>
        )}
      </div>

      {b.skipped.length > 0 && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-eg-red/8 px-2.5 py-2 text-[11px] text-eg-ink-soft">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-eg-red" />
          <span>
            {b.skipped.length} skipped:{" "}
            {b.skipped
              .slice(0, 3)
              .map((s) => `${s.siteName} (${s.reason})`)
              .join("; ")}
            {b.skipped.length > 3 ? `; +${b.skipped.length - 3} more` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
