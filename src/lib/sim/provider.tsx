"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export interface SimEventDTO {
  id: number;
  day: string;
  dayIndex: number;
  scope: "network" | "region" | "site";
  ref?: string;
  kind: string;
  headline: string;
  detail?: string;
  tone: "good" | "bad" | "neutral";
}

export interface SimStateDTO {
  simDate: string;
  dayIndex: number;
  running: boolean;
  speedMs: number;
  baselineDate: string;
}

export interface PerfSummaryDTO {
  days: number;
  cumMarginPool: number;
  cumUplift: number;
  upliftPct: number | null;
  currency: string;
}

interface SimCtx {
  state: SimStateDTO | null;
  events: SimEventDTO[];
  /** Network-wide cumulative performance summary (for the SimBar chip). */
  perf: PerfSummaryDTO | null;
  /** A step request is currently in flight. */
  busy: boolean;
  /** True while auto-advance is active (mirrors state.running locally). */
  playing: boolean;
  /**
   * Client timestamp (ms) when the current auto-advance cycle began — i.e. when
   * the last day landed or play was pressed. Consumers use it with the current
   * speed to render a countdown to the next day. Null when not running.
   */
  cycleStart: number | null;
  error: string | null;
  play: () => void;
  pause: () => void;
  step: (days?: number) => void;
  setSpeed: (ms: number) => void;
  reset: () => void;
}

const Ctx = createContext<SimCtx | null>(null);

const SPEED_OPTIONS = [
  1000, // 1s / day (fastest)
  2000,
  3000,
  5000,
  10000,
  30000,
  60000, // 1 min / day
  300000, // 5 min / day (slowest)
] as const;

// How often each tab nudges the shared clock / re-syncs from the server.
const TICK_INTERVAL_MS = 1000;
const POLL_INTERVAL_MS = 1500;

export function SimProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<SimStateDTO | null>(null);
  const [events, setEvents] = useState<SimEventDTO[]>([]);
  const [perf, setPerf] = useState<PerfSummaryDTO | null>(null);
  const [stepInflight, setStepInflight] = useState(false);
  // Held briefly after a day actually advances so the shimmer stays up while
  // server components re-fetch + repaint (router.refresh is async).
  const [refreshing, setRefreshing] = useState(false);
  // Start of the current auto-advance cycle (client clock) — drives the
  // countdown ring. Reset when a day lands or play is pressed.
  const [cycleStart, setCycleStart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Surfaces shimmer while either a step request is in flight OR a refresh is
  // settling. Consumers just read `busy`.
  const busy = stepInflight || refreshing;

  // `running` is SERVER state — all tabs read it. `playing` simply mirrors the
  // latest server `running` so the UI is consistent across browser instances.
  const playing = state?.running ?? false;

  const inflight = useRef(false); // a tick/step request is in flight
  const lastDayIndex = useRef<number | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply a server response. Refreshes server components when the day actually
  // changed (so any tab that observes an advance re-renders the dashboards).
  const applyState = useCallback(
    (data: {
      state?: SimStateDTO;
      events?: SimEventDTO[];
      perf?: PerfSummaryDTO | null;
      error?: string;
    }): boolean => {
      if (data.error) {
        setError(data.error);
        return false;
      }
      setError(null);
      if (data.perf !== undefined) setPerf(data.perf);
      if (data.state) {
        setState(data.state);
        if (
          lastDayIndex.current != null &&
          data.state.dayIndex !== lastDayIndex.current
        ) {
          router.refresh();
          // A day just landed — restart the countdown cycle.
          if (data.state.running) setCycleStart(Date.now());
          // Keep the shimmer up across the async refresh so it overlaps the
          // moment new data paints (and the change-flash fires).
          setRefreshing(true);
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => setRefreshing(false), 1100);
        }
        lastDayIndex.current = data.state.dayIndex;
      }
      if (data.events) setEvents(data.events);
      return true;
    },
    [router]
  );

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json()) as {
        state?: SimStateDTO;
        events?: SimEventDTO[];
        perf?: PerfSummaryDTO | null;
        error?: string;
        stepped?: boolean;
      };
    },
    []
  );

  // Initial load + steady poll so every tab tracks the shared server clock
  // (running/speed/date), even when another tab is the one driving it.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await fetch("/api/sim", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) applyState(data);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };
    void sync();
    const id = setInterval(sync, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [applyState]);

  // Shared-clock driver: while running, every tab pings `tick` on a short
  // interval. The server only advances when due (>= speed_ms since the last
  // advance) under an advisory lock, so the clock moves at one day per speed_ms
  // regardless of how many tabs are open — no tab "owns" the clock.
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (cancelled || inflight.current) return;
      inflight.current = true;
      try {
        const data = await post({ action: "tick" });
        if (!cancelled) {
          // applyState holds the shimmer when the day actually advances.
          applyState(data);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        inflight.current = false;
      }
    }, TICK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [playing, post, applyState]);

  // Keep the countdown cycle anchored: (re)start it when auto-advance is
  // running and whenever the speed changes; clear it when paused. The
  // day-advance reset in applyState handles the per-day restarts.
  const speedMs = state?.speedMs;
  useEffect(() => {
    if (playing) setCycleStart(Date.now());
    else setCycleStart(null);
  }, [playing, speedMs]);

  const play = useCallback(() => {
    // Optimistic local flip; server is the source of truth and the poll/tick
    // loops reconcile. Persisting running=true makes every other tab play too.
    setState((s) => (s ? { ...s, running: true } : s));
    void post({ action: "play", speedMs: state?.speedMs }).then(applyState);
  }, [post, applyState, state?.speedMs]);

  const pause = useCallback(() => {
    setState((s) => (s ? { ...s, running: false } : s));
    void post({ action: "pause" }).then(applyState);
  }, [post, applyState]);

  const step = useCallback(
    (days = 1) => {
      if (playing || inflight.current) return; // manual steps only while paused
      inflight.current = true;
      setStepInflight(true);
      void post({ action: "step", days })
        .then(applyState)
        .catch((e) => setError(String(e)))
        .finally(() => {
          inflight.current = false;
          setStepInflight(false);
        });
    },
    [playing, post, applyState]
  );

  const setSpeed = useCallback(
    (ms: number) => {
      setState((s) => (s ? { ...s, speedMs: ms } : s));
      void post({ action: "setSpeed", speedMs: ms }).then(applyState);
    },
    [post, applyState]
  );

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    []
  );

  const reset = useCallback(() => {
    setStepInflight(true);
    void post({ action: "reset" })
      .then((data) => {
        applyState(data);
        // Reset rolls back server data (history, recommendations, applied
        // prices) that applyState's refresh only triggers on a day-index CHANGE.
        // When we were already at/near the baseline the index may be unchanged,
        // so force a repaint here unconditionally and keep the shimmer up across
        // the async refresh so charts + recommendation history visibly revert.
        router.refresh();
        setRefreshing(true);
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => setRefreshing(false), 1100);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setStepInflight(false));
  }, [post, applyState, router]);

  return (
    <Ctx.Provider
      value={{ state, events, perf, busy, playing, cycleStart, error, play, pause, step, setSpeed, reset }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSim() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSim must be used within SimProvider");
  return ctx;
}

export { SPEED_OPTIONS };
