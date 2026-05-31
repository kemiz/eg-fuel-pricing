import { NextRequest } from "next/server";
import {
  applyStep,
  getPerfSummary,
  getSimEvents,
  getSimState,
  resetSim,
  setSimFlags,
  tickIfDue,
} from "@/lib/sim/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** GET /api/sim → current clock + recent events. */
export async function GET() {
  try {
    const [state, events, perf] = await Promise.all([
      getSimState(),
      getSimEvents(8),
      getPerfSummary().catch(() => null),
    ]);
    return json({ state, events, perf });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

interface PostBody {
  action: "step" | "tick" | "play" | "pause" | "reset" | "setSpeed";
  days?: number;
  speedMs?: number;
}

/** POST /api/sim → drive the clock. */
export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    switch (body.action) {
      case "step": {
        const days = Math.max(1, Math.min(30, Math.round(body.days ?? 1)));
        const state = await applyStep(days);
        const [events, perf] = await Promise.all([
          getSimEvents(8),
          getPerfSummary().catch(() => null),
        ]);
        return json({ state, events, perf });
      }
      case "tick": {
        // Shared-clock coordinated tick: advances only if running AND due.
        const { state, stepped } = await tickIfDue();
        const events = stepped ? await getSimEvents(8) : undefined;
        const perf = stepped ? await getPerfSummary().catch(() => null) : undefined;
        return json({ state, events, perf, stepped });
      }
      case "play": {
        const state = await setSimFlags({ running: true, speedMs: body.speedMs });
        return json({ state });
      }
      case "pause": {
        const state = await setSimFlags({ running: false });
        return json({ state });
      }
      case "setSpeed": {
        const state = await setSimFlags({ speedMs: body.speedMs });
        return json({ state });
      }
      case "reset": {
        const state = await resetSim();
        const [events, perf] = await Promise.all([
          getSimEvents(8),
          getPerfSummary().catch(() => null),
        ]);
        return json({ state, events, perf });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}
