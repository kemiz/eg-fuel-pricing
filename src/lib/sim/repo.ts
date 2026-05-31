import "server-only";
import { pgQuery, pgTransaction, type TxQuery } from "@/lib/db/lakebase";
import { APP, COST_SERIES } from "@/lib/db/env";
import {
  stepDay,
  perfSnapshot,
  type SimSiteState,
  type SimEvent,
  type SignalState,
} from "./engine";

export interface SimState {
  simDate: string; // YYYY-MM-DD
  dayIndex: number;
  running: boolean;
  speedMs: number;
  /** The seeded "today" the clock started from (dayIndex 0). */
  baselineDate: string;
}

export interface SimEventRow extends SimEvent {
  id: number;
  day: string;
  dayIndex: number;
}

// Date handling: Postgres DATE values must be treated as plain YYYY-MM-DD
// strings. Routing them through JS `Date` introduces timezone off-by-one
// errors (node-postgres parses DATE at local midnight, toISOString shifts to
// UTC). So we normalise to a string and do all arithmetic in UTC explicitly.
const toIso = (v: unknown): string => {
  if (v instanceof Date) {
    return new Date(
      Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())
    )
      .toISOString()
      .slice(0, 10);
  }
  return String(v).slice(0, 10);
};

/** Add `n` days to a YYYY-MM-DD string, staying in UTC. */
function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function rowToState(r: Record<string, unknown>): SimState {
  const simDate = toIso(r.sim_date);
  const dayIndex = Number(r.day_index);
  return {
    simDate,
    dayIndex,
    running: Boolean(r.running),
    speedMs: Number(r.speed_ms),
    baselineDate: addDays(simDate, -dayIndex),
  };
}

/** Read the singleton simulation clock (assumes the migration has run). */
export async function getSimState(): Promise<SimState> {
  const rows = await pgQuery(
    `SELECT sim_date, day_index, running, speed_ms FROM ${APP("sim_state")} WHERE id = 1`
  );
  if (!rows.length) {
    // Fallback: anchor to the newest history day if the clock row is missing.
    const h = await pgQuery(
      `SELECT COALESCE(max(day), CURRENT_DATE) AS d FROM ${APP("price_history")}`
    );
    const d = toIso(h[0]?.d ?? new Date());
    return { simDate: d, dayIndex: 0, running: false, speedMs: 3000, baselineDate: d };
  }
  return rowToState(rows[0]);
}

export interface PerfSummary {
  days: number;
  cumMarginPool: number;
  cumUplift: number;
  upliftPct: number | null;
  currency: "USD";
}

/**
 * Fast network-wide cumulative performance roll-up for the global SimBar chip
 * (one aggregate query over the 'ALL' rows). Reported in USD (the network
 * roll-up mixes currencies, so this is an indicative headline, not an FX-exact
 * figure). Returns zeros before any day has been stepped.
 */
export async function getPerfSummary(): Promise<PerfSummary> {
  const rows = await pgQuery(
    `SELECT count(*)::int AS days,
            COALESCE(sum(margin_pool), 0)    AS cum_margin_pool,
            COALESCE(sum(cf_margin_pool), 0) AS cum_cf_margin_pool
       FROM ${APP("sim_daily_perf")}
      WHERE country = 'ALL'`
  );
  const r = rows[0] ?? {};
  const cum = Number(r.cum_margin_pool ?? 0);
  const cf = Number(r.cum_cf_margin_pool ?? 0);
  const uplift = cum - cf;
  return {
    days: Number(r.days ?? 0),
    cumMarginPool: cum,
    cumUplift: uplift,
    upliftPct: cf > 0 ? (uplift / cf) * 100 : null,
    currency: "USD",
  };
}

/** Recent market events, newest first. */
export async function getSimEvents(limit = 8): Promise<SimEventRow[]> {
  const rows = await pgQuery(
    `SELECT id, day, day_index, scope, ref, kind, headline, detail, tone
       FROM ${APP("sim_events")}
      ORDER BY day_index DESC, id DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    day: toIso(r.day),
    dayIndex: Number(r.day_index),
    scope: r.scope as SimEvent["scope"],
    ref: (r.ref as string) ?? undefined,
    kind: r.kind as SimEvent["kind"],
    headline: r.headline as string,
    detail: (r.detail as string) ?? undefined,
    tone: r.tone as SimEvent["tone"],
  }));
}

/**
 * Read the current per-site REGULAR state the engine needs, using `q`.
 *
 * `baselineIso` is the seeded "today" (sim baseline). We read each series'
 * baseline price + cost there to derive stable mean-reversion anchors
 * (`baseUnitCost`, `baseEgMargin`, per-competitor `baseMargin`) so the engine
 * keeps prices/costs oscillating around home rather than ramping away.
 */
async function readCurrentState(
  q: TxQuery,
  baselineIso: string
): Promise<SimSiteState[]> {
  const rows = await q(
    `WITH reg_cost AS (
        SELECT site_id, wholesale_cost + delivery_cost AS unit_cost
          FROM ${APP("costs")} WHERE grade_id = 'regular'
     ),
     reg_dem AS (
        SELECT site_id, avg_daily_volume, base_avg_daily_volume, elasticity
          FROM ${APP("demand_signals")} WHERE grade_id = 'regular'
     ),
     latest_eg AS (
        SELECT DISTINCT ON (site_id) site_id, price
          FROM ${APP("price_history")} WHERE grade_id = 'regular' AND is_eg = true
         ORDER BY site_id, day DESC
     ),
     -- Baseline-day anchors (the seeded "today"): EG price + unit cost.
     base_eg AS (
        SELECT site_id, price FROM ${APP("price_history")}
         WHERE grade_id = 'regular' AND is_eg = true AND day = $1::date
     ),
     base_cost AS (
        SELECT site_id, price FROM ${APP("price_history")}
         WHERE grade_id = 'regular' AND series = '${COST_SERIES}' AND day = $1::date
     )
     SELECT s.site_id, s.country, s.region,
            rc.unit_cost, rd.avg_daily_volume, rd.base_avg_daily_volume,
            rd.elasticity, le.price AS eg_price,
            be.price AS base_eg_price, bc.price AS base_cost
       FROM ${APP("sites")} s
       LEFT JOIN reg_cost rc ON rc.site_id = s.site_id
       LEFT JOIN reg_dem  rd ON rd.site_id = s.site_id
       LEFT JOIN latest_eg le ON le.site_id = s.site_id
       LEFT JOIN base_eg be ON be.site_id = s.site_id
       LEFT JOIN base_cost bc ON bc.site_id = s.site_id`,
    [baselineIso]
  );

  // Competitor current prices (latest history row per series, else seed price)
  // plus each series' baseline-day price for the margin anchor.
  const compRows = await q(
    `WITH latest_comp AS (
        SELECT DISTINCT ON (site_id, series) site_id, series, price
          FROM ${APP("price_history")} WHERE grade_id = 'regular' AND is_eg = false
            AND series <> '${COST_SERIES}'
         ORDER BY site_id, series, day DESC
     ),
     base_comp AS (
        SELECT site_id, series, price
          FROM ${APP("price_history")}
         WHERE grade_id = 'regular' AND is_eg = false
           AND series <> '${COST_SERIES}' AND day = $1::date
     )
     SELECT cp.site_id, cp.competitor_name AS name,
            COALESCE(lc.price, cp.price) AS price,
            bcmp.price AS base_price
       FROM ${APP("competitor_prices")} cp
       LEFT JOIN latest_comp lc
         ON lc.site_id = cp.site_id AND lc.series = cp.competitor_name
       LEFT JOIN base_comp bcmp
         ON bcmp.site_id = cp.site_id AND bcmp.series = cp.competitor_name
      WHERE cp.grade_id = 'regular'`,
    [baselineIso]
  );
  // Pre-index baseline cost per site (for competitor base-margin derivation).
  const baseCostBySite = new Map<string, number>();
  for (const r of rows) {
    if (r.base_cost != null)
      baseCostBySite.set(r.site_id as string, Number(r.base_cost));
    else if (r.unit_cost != null)
      baseCostBySite.set(r.site_id as string, Number(r.unit_cost));
  }
  const compBySite = new Map<
    string,
    { name: string; price: number; baseMargin?: number }[]
  >();
  for (const c of compRows) {
    const siteId = c.site_id as string;
    const arr = compBySite.get(siteId) ?? [];
    const baseCost = baseCostBySite.get(siteId);
    const basePrice = c.base_price == null ? null : Number(c.base_price);
    const baseMargin =
      basePrice != null && baseCost != null ? basePrice - baseCost : undefined;
    arr.push({ name: c.name as string, price: Number(c.price), baseMargin });
    compBySite.set(siteId, arr);
  }

  return rows
    .filter((r) => r.unit_cost != null && r.eg_price != null)
    .map((r) => {
      const unitCost = Number(r.unit_cost);
      const baseUnitCost = r.base_cost == null ? unitCost : Number(r.base_cost);
      const baseEgPrice =
        r.base_eg_price == null ? Number(r.eg_price) : Number(r.base_eg_price);
      return {
        siteId: r.site_id as string,
        region: r.region as string,
        country: r.country as "US" | "UK",
        unitCost,
        baseUnitCost,
        egPrice: Number(r.eg_price),
        baseEgMargin: baseEgPrice - baseUnitCost,
        baseEgPrice,
        volume: r.avg_daily_volume == null ? 1500 : Number(r.avg_daily_volume),
        baseVolume:
          r.base_avg_daily_volume != null
            ? Number(r.base_avg_daily_volume)
            : r.avg_daily_volume == null
              ? 1500
              : Number(r.avg_daily_volume),
        elasticity: r.elasticity == null ? -1.4 : Number(r.elasticity),
        competitors: compBySite.get(r.site_id as string) ?? [],
      };
    });
}

/**
 * Persist one stepped day inside the open transaction.
 *
 * Performance: writing ~700 rows per day one-statement-at-a-time over a remote
 * OAuth'd connection is far too slow for auto-advance. Everything here is done
 * with BATCHED multi-row statements (a handful of round-trips per day) instead.
 */
async function writeDay(
  q: TxQuery,
  dayIso: string,
  dayIndex: number,
  sites: SimSiteState[],
  events: SimEvent[]
) {
  // --- price_history: one big multi-row upsert. ---
  {
    const tuples: string[] = [];
    const params: unknown[] = [];
    let p = 0;
    const add = (siteId: string, series: string, isEg: boolean, price: number) => {
      tuples.push(
        `($${++p},'regular',$${++p},$${++p},$${++p},$${++p})`
      );
      params.push(siteId, series, isEg, dayIso, price);
    };
    for (const s of sites) {
      add(s.siteId, "EG", true, s.egPrice);
      for (const c of s.competitors) add(s.siteId, c.name, false, c.price);
      // Hidden per-day cost series so historical margins use same-day cost.
      add(s.siteId, COST_SERIES, false, s.unitCost);
    }
    // Postgres caps bind params at 65535; chunk well under that.
    const CHUNK = 1000; // 1000 tuples × 5 params = 5000 params per statement
    for (let i = 0; i < tuples.length; i += CHUNK) {
      const slice = tuples.slice(i, i + CHUNK);
      const sliceParams = params.slice(i * 5, (i + slice.length) * 5);
      // Re-number placeholders for the slice (they must start at $1).
      let n = 0;
      const renumbered = slice
        .map(() => `($${++n},'regular',$${++n},$${++n},$${++n},$${++n})`)
        .join(",");
      await q(
        `INSERT INTO ${APP("price_history")} (site_id, grade_id, series, is_eg, day, price)
         VALUES ${renumbered}
         ON CONFLICT (site_id, grade_id, series, day) DO UPDATE SET price = EXCLUDED.price`,
        sliceParams
      );
    }
  }

  // --- costs: batched UPDATE ... FROM (VALUES ...). ---
  {
    const tuples: string[] = [];
    const params: unknown[] = [];
    let p = 0;
    for (const s of sites) {
      tuples.push(`($${++p},$${++p}::numeric)`);
      params.push(s.siteId, s.unitCost);
    }
    await q(
      `UPDATE ${APP("costs")} c
          SET wholesale_cost = GREATEST(0.05, v.unit_cost - c.delivery_cost),
              as_of = $${++p}::date
         FROM (VALUES ${tuples.join(",")}) AS v(site_id, unit_cost)
        WHERE c.site_id = v.site_id AND c.grade_id = 'regular'`,
      [...params, dayIso]
    );
  }

  // --- demand_signals: batched UPDATE ... FROM (VALUES ...). ---
  {
    const tuples: string[] = [];
    const params: unknown[] = [];
    let p = 0;
    for (const s of sites) {
      tuples.push(`($${++p},$${++p}::int)`);
      params.push(s.siteId, Math.round(s.volume));
    }
    await q(
      `UPDATE ${APP("demand_signals")} d
          SET avg_daily_volume = v.vol, as_of = $${++p}::date
         FROM (VALUES ${tuples.join(",")}) AS v(site_id, vol)
        WHERE d.site_id = v.site_id AND d.grade_id = 'regular'`,
      [...params, dayIso]
    );
  }

  // --- competitor_prices: batched UPDATE ... FROM (VALUES ...). ---
  {
    const tuples: string[] = [];
    const params: unknown[] = [];
    let p = 0;
    for (const s of sites) {
      for (const c of s.competitors) {
        tuples.push(`($${++p},$${++p},$${++p}::numeric)`);
        params.push(s.siteId, c.name, c.price);
      }
    }
    if (tuples.length) {
      await q(
        `UPDATE ${APP("competitor_prices")} cp
            SET price = v.price, observed_at = now()
           FROM (VALUES ${tuples.join(",")}) AS v(site_id, name, price)
          WHERE cp.site_id = v.site_id AND cp.competitor_name = v.name
            AND cp.grade_id = 'regular'`,
        params
      );
    }
  }

  // --- performance ledger: one row per country + the 'ALL' network roll-up,
  // captured from THIS day's actual numbers (so margin pool uses the real
  // same-day volume) plus the baseline-price counterfactual. created_at
  // defaults to now(), so we insert only the 15 data columns. ---
  {
    const perf = perfSnapshot(sites);
    const perfTuples: string[] = [];
    const perfParams: unknown[] = [];
    let pp = 0;
    for (const r of perf) {
      const ph: string[] = [];
      for (let i = 0; i < 15; i++) ph.push(`$${++pp}`);
      perfTuples.push(`(${ph.join(",")})`);
      perfParams.push(
        dayIndex,
        dayIso,
        r.country,
        r.sites,
        r.volume,
        r.revenue,
        r.marginPool,
        r.avgMargin,
        r.avgEgPrice,
        r.avgCompPrice,
        r.cheaper,
        r.inLine,
        r.dearer,
        r.cfVolume,
        r.cfMarginPool
      );
    }
    if (perfTuples.length) {
      await q(
        `INSERT INTO ${APP("sim_daily_perf")}
           (day_index, day, country, sites, volume, revenue, margin_pool,
            avg_margin, avg_eg_price, avg_comp_price, cheaper, in_line, dearer,
            cf_volume, cf_margin_pool)
         VALUES ${perfTuples.join(",")}
         ON CONFLICT (day_index, country) DO UPDATE SET
           day = EXCLUDED.day, sites = EXCLUDED.sites, volume = EXCLUDED.volume,
           revenue = EXCLUDED.revenue, margin_pool = EXCLUDED.margin_pool,
           avg_margin = EXCLUDED.avg_margin, avg_eg_price = EXCLUDED.avg_eg_price,
           avg_comp_price = EXCLUDED.avg_comp_price, cheaper = EXCLUDED.cheaper,
           in_line = EXCLUDED.in_line, dearer = EXCLUDED.dearer,
           cf_volume = EXCLUDED.cf_volume, cf_margin_pool = EXCLUDED.cf_margin_pool`,
        perfParams
      );
    }
  }

  // --- events: one multi-row insert (usually 0-3 per day). ---
  if (events.length) {
    const tuples: string[] = [];
    const params: unknown[] = [];
    let p = 0;
    for (const ev of events) {
      tuples.push(
        `($${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p},$${++p})`
      );
      params.push(
        dayIso,
        dayIndex,
        ev.scope,
        ev.ref ?? null,
        ev.kind,
        ev.headline,
        ev.detail ?? null,
        ev.tone
      );
    }
    await q(
      `INSERT INTO ${APP("sim_events")} (day, day_index, scope, ref, kind, headline, detail, tone)
       VALUES ${tuples.join(",")}`,
      params
    );
  }
}

const SIM_LOCK = 918273; // app-wide advisory lock key for the sim clock

/**
 * Read the carried mean-reverting walk levels (the seed's `common`/`priv`
 * levels, advanced one day at a time). Returns an empty map if none persisted
 * yet — the engine treats absent levels as a clean start at the baseline, so
 * the first sim day continues the seed path with no jump.
 */
async function readSignalState(
  q: TxQuery,
  expectedDayIndex: number
): Promise<SignalState> {
  const rows = await q(
    `SELECT day_index, levels FROM ${APP("sim_signal_state")} WHERE id = 1`
  );
  if (!rows.length) return {};
  // If the stored levels are for a different day than we're about to continue
  // from (e.g. after a manual reset elsewhere), start clean rather than apply a
  // stale level — keeps the walk consistent with the price history on disk.
  if (Number(rows[0].day_index) !== expectedDayIndex) return {};
  const lv = rows[0].levels;
  return (typeof lv === "string" ? JSON.parse(lv) : lv) as SignalState;
}

/** Persist the carried walk levels for `dayIndex`. */
async function writeSignalState(
  q: TxQuery,
  dayIndex: number,
  signal: SignalState
) {
  await q(
    `INSERT INTO ${APP("sim_signal_state")} (id, day_index, levels, updated_at)
     VALUES (1, $1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET day_index = EXCLUDED.day_index,
                                    levels = EXCLUDED.levels,
                                    updated_at = now()`,
    [dayIndex, JSON.stringify(signal)]
  );
}

/** Advance `days` inside an already-locked transaction; returns the new state. */
async function advanceDays(q: TxQuery, state: SimState, days: number): Promise<SimState> {
  const baselineIso = addDays(state.simDate, -state.dayIndex);
  let sites = await readCurrentState(q, baselineIso);
  let simDate = state.simDate;
  let dayIndex = state.dayIndex;
  // Carried walk levels continue from where the last advance left off (keyed to
  // the current dayIndex). The engine advances them one step per day.
  let signal = await readSignalState(q, dayIndex);

  for (let d = 0; d < days; d++) {
    simDate = addDays(simDate, 1);
    dayIndex += 1;
    const { sites: nextSites, events, signal: nextSignal } = stepDay(
      sites,
      dayIndex + 1,
      signal
    );
    await writeDay(q, simDate, dayIndex, nextSites, events);
    sites = nextSites;
    signal = nextSignal;
  }
  await writeSignalState(q, dayIndex, signal);

  // Note: ON CONFLICT updates only the listed columns, so running/speed_ms and
  // the advisory-lock semantics are preserved. updated_at marks the advance
  // time, which the shared-clock tick coordinator reads.
  await q(
    `INSERT INTO ${APP("sim_state")} (id, sim_date, day_index, updated_at)
     VALUES (1, $1, $2, now())
     ON CONFLICT (id) DO UPDATE SET sim_date = EXCLUDED.sim_date,
                                    day_index = EXCLUDED.day_index,
                                    updated_at = now()`,
    [simDate, dayIndex]
  );
  return { ...state, simDate, dayIndex };
}

async function readStateForUpdate(q: TxQuery): Promise<SimState> {
  const rows = await q(
    `SELECT sim_date, day_index, running, speed_ms FROM ${APP("sim_state")} WHERE id = 1 FOR UPDATE`
  );
  const today = new Date().toISOString().slice(0, 10);
  return rows.length
    ? rowToState(rows[0])
    : { simDate: today, dayIndex: 0, running: false, speedMs: 3000, baselineDate: today };
}

/**
 * Advance the simulation by `days` (default 1) — an explicit manual step. The
 * whole batch runs in one transaction guarded by an advisory lock so
 * overlapping ticks can't double-advance.
 */
export async function applyStep(days = 1): Promise<SimState> {
  return pgTransaction(async (q) => {
    await q(`SELECT pg_advisory_xact_lock($1)`, [SIM_LOCK]);
    const state = await readStateForUpdate(q);
    return advanceDays(q, state, days);
  });
}

/**
 * Shared-clock tick. Any client may call this on a short interval; the clock
 * only actually advances when it is `running` AND at least `speed_ms` has
 * elapsed since the last advance. Because the check + advance happen inside the
 * advisory-locked transaction (and the advance bumps updated_at), exactly one
 * day is produced per `speed_ms` regardless of how many browser tabs are
 * ticking. Returns the (possibly unchanged) state plus whether it stepped.
 */
export async function tickIfDue(): Promise<{ state: SimState; stepped: boolean }> {
  return pgTransaction(async (q) => {
    await q(`SELECT pg_advisory_xact_lock($1)`, [SIM_LOCK]);
    const rows = await q(
      `SELECT sim_date, day_index, running, speed_ms,
              (now() - updated_at) >= (speed_ms * interval '1 millisecond') AS due
         FROM ${APP("sim_state")} WHERE id = 1 FOR UPDATE`
    );
    if (!rows.length) {
      const state = await getSimStateTx(q);
      return { state, stepped: false };
    }
    const state = rowToState(rows[0]);
    const due = Boolean(rows[0].due);
    if (!state.running || !due) {
      return { state, stepped: false };
    }
    const next = await advanceDays(q, state, 1);
    return { state: next, stepped: true };
  });
}

/** Set running/speed flags (client uses these to drive auto-advance). */
export async function setSimFlags(opts: {
  running?: boolean;
  speedMs?: number;
}): Promise<SimState> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let p = 0;
  if (opts.running != null) {
    sets.push(`running = $${++p}`);
    params.push(opts.running);
  }
  if (opts.speedMs != null) {
    // Allow up to 5 min/day so the slow speeds in the UI actually apply.
    sets.push(`speed_ms = $${++p}`);
    params.push(Math.max(500, Math.min(600000, Math.round(opts.speedMs))));
  }
  if (sets.length) {
    sets.push(`updated_at = now()`);
    await pgQuery(
      `UPDATE ${APP("sim_state")} SET ${sets.join(", ")} WHERE id = 1`,
      params
    );
  }
  return getSimState();
}

/**
 * Reset the clock and remove all sim-appended days, returning to the seeded
 * baseline. Baseline = the day_index-0 anchor; anything later was sim-generated.
 */
export async function resetSim(): Promise<SimState> {
  return pgTransaction(async (q) => {
    await q(`SELECT pg_advisory_xact_lock($1)`, [918273]);
    const rows = await q(
      `SELECT sim_date, day_index FROM ${APP("sim_state")} WHERE id = 1 FOR UPDATE`
    );
    if (rows.length) {
      const dayIndex = Number(rows[0].day_index);
      const baseIso = addDays(toIso(rows[0].sim_date), -dayIndex);
      // Drop appended history + events beyond the baseline.
      await q(`DELETE FROM ${APP("price_history")} WHERE day > $1`, [baseIso]);
      await q(`DELETE FROM ${APP("sim_events")}`);
      // Clear the experiment tape + intervention log — they belong to the run
      // we're discarding.
      await q(`DELETE FROM ${APP("sim_daily_perf")}`);
      await q(`DELETE FROM ${APP("sim_interventions")}`);
      // Drop recommendations generated DURING the run (sim_day_index > 0) so the
      // "Recommendation history" rolls back with the rest of the run. Seeded
      // baseline recs (sim_day_index NULL or 0) are kept. Without this, agent
      // recommendations from the discarded run linger and the reset looks broken.
      await q(
        `DELETE FROM ${APP("price_recommendations")}
          WHERE sim_day_index IS NOT NULL AND sim_day_index > 0`
      );
      // Re-point the "current" tables at the baseline day's history.
      await q(
        `UPDATE ${APP("competitor_prices")} cp
            SET price = lc.price
           FROM (
             SELECT DISTINCT ON (site_id, series) site_id, series, price
               FROM ${APP("price_history")}
              WHERE grade_id = 'regular' AND is_eg = false
                AND series <> '${COST_SERIES}'
              ORDER BY site_id, series, day DESC
           ) lc
          WHERE cp.site_id = lc.site_id AND cp.competitor_name = lc.series
            AND cp.grade_id = 'regular'`
      );
      // Re-point unit cost at the baseline day's per-day __cost__ series. The
      // costs table is mutated every stepped day, so without this it stays
      // inflated after a reset — making the first post-reset day's cost lurch
      // up and the margin collapse at the seam.
      await q(
        `UPDATE ${APP("costs")} c
            SET wholesale_cost = GREATEST(0.05, lc.price - c.delivery_cost)
           FROM (
             SELECT DISTINCT ON (site_id) site_id, price
               FROM ${APP("price_history")}
              WHERE grade_id = 'regular' AND series = '${COST_SERIES}'
              ORDER BY site_id, day DESC
           ) lc
          WHERE c.site_id = lc.site_id AND c.grade_id = 'regular'`
      );
      // Restore demand volumes to their seeded baseline. avg_daily_volume is
      // mutated every simulated day as demand responds to pricing, so without
      // this a reset would keep a drifted volume level (and re-anchor the engine
      // to it) — inflating the margin pool. Only restore where a baseline was
      // captured (older seeds may not have it).
      await q(
        `UPDATE ${APP("demand_signals")}
            SET avg_daily_volume = base_avg_daily_volume
          WHERE base_avg_daily_volume IS NOT NULL`
      );
      // Clear the carried walk levels so the next advance restarts cleanly from
      // the baseline (no jump at the seam after a reset).
      await q(
        `UPDATE ${APP("sim_signal_state")}
            SET day_index = 0, levels = '{}'::jsonb, updated_at = now()
          WHERE id = 1`
      );
      await q(
        `UPDATE ${APP("sim_state")} SET sim_date = $1, day_index = 0,
                running = false, updated_at = now() WHERE id = 1`,
        [baseIso]
      );
    }
    return getSimStateTx(q);
  });
}

async function getSimStateTx(q: TxQuery): Promise<SimState> {
  const rows = await q(
    `SELECT sim_date, day_index, running, speed_ms FROM ${APP("sim_state")} WHERE id = 1`
  );
  return rowToState(rows[0]);
}
