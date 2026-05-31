/**
 * Simulation engine — advances the EG forecourt market by one day.
 *
 * Pure, dependency-free logic so it can run on the server (per tick) and be
 * reasoned about in isolation. Given the current per-site state it returns the
 * next day's state plus any market events that fired.
 *
 * Model (full market):
 *   - A shared "crude/wholesale" index drifts as a mean-reverting random walk.
 *     This nudges every site's unit cost and the whole local market up/down.
 *   - Each price series (EG + each competitor) is driven by a BLEND of that
 *     shared crude move (weighted by its own `commonWeight`) and its OWN
 *     private random walk (unique trend, noise and independent shocks). A soft
 *     pull toward the local price band keeps the spread plausible. Combined
 *     with asymmetric pass-through ("rockets & feathers": up fast, down slow)
 *     this makes the lines genuinely diverge and cross — no two are the same
 *     line shifted by a constant (the old behaviour).
 *   - Demand reacts to EG's price gap vs the local competitor average through
 *     the site's elasticity (cheaper than rivals -> volume up, dearer -> down).
 *   - Occasional shocks (crude spike, regional price war, local outage) perturb
 *     costs / competitor behaviour and are emitted as events.
 *
 * Determinism: the caller passes a numeric `seed` (derived from the day index)
 * so a given day always advances the same way — re-running a tick is safe.
 */

export type Tone = "good" | "bad" | "neutral";

export interface SimCompetitor {
  name: string;
  price: number;
  /**
   * The brand's natural per-unit margin at the simulation baseline (its
   * baseline price − baseline cost). Prices mean-revert toward
   * `cost + baseMargin`, so a brand keeps its characteristic position and the
   * whole network preserves margin as crude moves. Optional for back-compat;
   * the engine falls back to the current gap when absent.
   */
  baseMargin?: number;
}

export interface SimSiteState {
  siteId: string;
  region: string;
  country: "US" | "UK";
  /** wholesale + delivery, the per-unit cost. */
  unitCost: number;
  /**
   * The site's unit cost at the simulation baseline. Cost mean-reverts toward
   * this anchor so the crude/cost level oscillates instead of ramping away.
   * Optional for back-compat; falls back to the current cost when absent.
   */
  baseUnitCost?: number;
  /** EG's own current pump price (regular). */
  egPrice: number;
  /** EG's natural per-unit margin at the baseline (baseline EG price − cost). */
  baseEgMargin?: number;
  /**
   * EG's pump price at the simulation baseline (day 0). Held flat in the
   * counterfactual ("what if we never touched prices") so the performance
   * tracker can attribute uplift to active pricing. Falls back to the current
   * price when absent.
   */
  baseEgPrice?: number;
  competitors: SimCompetitor[];
  /** modelled average daily volume (regular). */
  volume: number;
  /**
   * The site's baseline (day-0) daily volume. Volume mean-reverts toward this
   * anchor so day-to-day noise can't accumulate into an unbounded drift.
   * Falls back to the current volume when absent.
   */
  baseVolume?: number;
  /** price elasticity of demand (negative). */
  elasticity: number;
}

export interface SimEvent {
  scope: "network" | "region" | "site";
  ref?: string;
  kind: "crude_spike" | "price_war" | "outage" | "demand_swing";
  headline: string;
  detail?: string;
  tone: Tone;
}

export interface StepResult {
  sites: SimSiteState[];
  events: SimEvent[];
  /** Net change in the shared crude index this day (for UI/debug). */
  crudeDelta: number;
  /** Updated carried walk levels to persist for the next day. */
  signal: SignalState;
}

/* ----------------------------- PRNG ----------------------------- */
// Mulberry32 — small, fast, seedable. Deterministic per seed.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-string deterministic hash so each site/series gets stable idiosyncrasy. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const round = (v: number, dp: number) => Number(v.toFixed(dp));

/**
 * Stable per-series "personality": its weight on the shared market vs its own
 * private walk, and its asymmetric pass-through speeds. Ranges mirror the seed's
 * `buildSeries` opts (EG hugs the market a little more; rivals spread wider so
 * some hug it and others wander off and cross). Derived from the key so it's
 * identical every day and differs per brand — the reason lines diverge.
 */
function seriesTraits(key: string) {
  const t = mulberry32(hash(key));
  const pick = (lo: number, hi: number) => lo + t() * (hi - lo);
  const isEg = key.endsWith("|EG");
  return {
    // Weight on the shared "common" signal (seed parity: EG 0.62–0.72; rivals
    // 0.42–0.72 so some hug the market and others clearly wander and cross).
    commonWeight: isEg ? pick(0.55, 0.7) : pick(0.3, 0.7),
    // Asymmetric pass-through ("rockets & feathers": up fast, down slow).
    fastUp: isEg ? pick(0.5, 0.78) : pick(0.42, 0.85),
    slowDown: isEg ? pick(0.12, 0.22) : pick(0.1, 0.3),
  };
}

/* ------------------------------------------------------------------ */
/* Mean-reverting random-walk signal — the SAME process as the seed's   */
/* `makeSignal` in run-seed.mjs, but advanced ONE DAY AT A TIME with the */
/* carried level persisted by the caller. This is what makes the live    */
/* simulation use the identical algorithm to the seed history (rather    */
/* than an approximation): same recurrence, same parameter ranges, same  */
/* asymmetric pass-through.                                              */
/* ------------------------------------------------------------------ */

/** Carried walk levels keyed by series id; persisted between days. */
export type SignalState = Record<string, number>;

/**
 * Stable per-signal parameters, derived deterministically from the signal key
 * (so they never need persisting and match every run). Ranges mirror the seed's
 * `makeSignal` calls: the shared "common"/cost signal vs a per-brand "priv"
 * signal use different bands, exactly as run-seed.mjs does.
 */
function signalParams(key: string, isUS: boolean) {
  const r = mulberry32(hash("walk:" + key));
  const pick = (lo: number, hi: number) => lo + r() * (hi - lo);
  const shared = key.startsWith("common:");
  // Seed parity: `common` uses reversion 0.045 + wider seasonal/period; brand
  // `priv` signals revert a touch faster with a shorter season.
  return shared
    ? {
        vol: isUS ? pick(0.016, 0.03) : pick(0.01, 0.018),
        reversion: 0.045,
        trendSlope: pick(-0.006, 0.006),
        seasonalAmp: pick(0.04, 0.1),
        seasonalPeriod: pick(40, 75),
        seasonalPhase: r() * Math.PI * 2,
      }
    : {
        // Brand private walks wander more (and revert a touch less) than the
        // shared signal, so their positions in the band genuinely cross over
        // rather than staying pinned to their starting offset.
        vol: isUS ? pick(0.03, 0.05) : pick(0.018, 0.03),
        reversion: pick(0.035, 0.07),
        trendSlope: pick(-0.006, 0.006),
        seasonalAmp: pick(0.03, 0.09),
        seasonalPeriod: pick(22, 60),
        seasonalPhase: r() * Math.PI * 2,
      };
}

/**
 * One incremental step of the seed's recurrence:
 *   lvl += reversion*(trend + seasonal − lvl) + noise
 * `day` is the absolute simulated day index; `noise` is deterministic per
 * (key, day) so re-running a tick reproduces the same advance. Returns the new
 * level (centred near 0, NOT yet scaled).
 */
function advanceLevel(
  prev: number,
  key: string,
  day: number,
  isUS: boolean,
  scale: number,
  totalDays = 90
): number {
  const p = signalParams(key, isUS);
  const r = mulberry32((hash("walk:" + key) ^ ((day + 1) * 0x9e3779b1)) >>> 0);
  const noise = (-p.vol + r() * 2 * p.vol) * scale * 3;
  // Seasonal is a BOUNDED oscillation around 0 — fine for an open-ended run.
  const seasonal =
    p.seasonalAmp * scale * Math.sin(p.seasonalPhase + (day / p.seasonalPeriod) * Math.PI * 2);
  // Trend: the seed used an UNBOUNDED linear ramp `trendSlope*(day − totalDays/2)`
  // over its fixed 0..90 window. In an open-ended live run that term grows without
  // limit (day keeps climbing past totalDays), so any site with a non-zero slope
  // ramps its level — and hence its price/margin — away forever. That was the main
  // driver of the runaway, always-positive "uplift". We damp the trend onto a
  // saturating curve so it contributes a small bounded tilt early and then flattens,
  // leaving the walk genuinely mean-reverting (around seasonal) over long horizons.
  const half = totalDays / 2;
  const tEff = half * Math.tanh((day - half) / half); // ∈ (−half, +half), saturates
  const trend = p.trendSlope * scale * tEff;
  return prev + p.reversion * (trend + seasonal - prev) + noise;
}

/**
 * Advance the whole network by one simulated day.
 *
 * @param sites    current per-site state
 * @param seed     deterministic seed for this day (e.g. dayIndex + 1)
 */
export function stepDay(
  sites: SimSiteState[],
  seed: number,
  signalIn: SignalState = {}
): StepResult {
  const rnd = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);

  const events: SimEvent[] = [];
  // Working copy of the carried walk levels — mutated as we advance each signal,
  // then returned so the caller persists it for the next day.
  const signal: SignalState = { ...signalIn };

  // Absolute day index (seed is dayIndex + 1). Walk levels advance one step per
  // day using the seed's exact recurrence, so consecutive days are correlated
  // (smooth, gliding paths) — identical process to the seed history.
  const day = seed - 1;

  // Network shock collected this day, applied additively on top of the smooth
  // walk-derived cost move (so a shock reads as a swing that then eases out).
  let shockDelta = 0;

  // Network-wide crude shock (~9% of days): a NOTABLE move everyone feels, up or
  // down with equal odds so the level does not drift one way.
  if (rnd() < 0.07) {
    const up = rnd() < 0.5;
    const mag = between(0.015, 0.03);
    shockDelta += up ? mag : -mag;
    events.push({
      scope: "network",
      kind: "crude_spike",
      headline: up
        ? `Crude firms — wholesale up ${(mag * 100).toFixed(0)}¢ equivalent`
        : `Crude eases — wholesale down ${(mag * 100).toFixed(0)}¢ equivalent`,
      detail: up
        ? "A spot-market move pushes wholesale costs up across the network. Expect pump prices to follow within a day or two."
        : "Spot wholesale costs fall back across the network, loosening cost pressure on pump prices.",
      tone: up ? "bad" : "good",
    });
  }

  // Pick at most one regional price war for the day (~10% of days).
  let warRegion: string | null = null;
  if (rnd() < 0.1 && sites.length) {
    const regions = [...new Set(sites.map((s) => s.region))];
    warRegion = regions[Math.floor(rnd() * regions.length)] ?? null;
    if (warRegion) {
      events.push({
        scope: "region",
        ref: warRegion,
        kind: "price_war",
        headline: `Price war in ${warRegion}`,
        detail:
          "Local competitors are cutting aggressively — rival prices drop and demand becomes more price-sensitive.",
        tone: "bad",
      });
    }
  }

  // Occasional single-site supply outage (~6% of days): cost spike at one site.
  let outageSiteId: string | null = null;
  if (rnd() < 0.06 && sites.length) {
    outageSiteId = sites[Math.floor(rnd() * sites.length)]?.siteId ?? null;
  }

  const next: SimSiteState[] = sites.map((s) => {
    const isUS = s.country === "US";
    const dp = isUS ? 2 : 3;
    // GBP/litre moves are smaller in absolute terms than USD/gallon.
    const scale = isUS ? 1 : 0.42;

    // Per-site idiosyncratic generator so each site moves a little differently
    // but reproducibly for this seed.
    const sr = mulberry32((seed ^ hash(s.siteId)) >>> 0);
    const sBetween = (lo: number, hi: number) => lo + sr() * (hi - lo);

    // Baseline volume anchor: captured once (first step after a reset, when the
    // signal state is empty) from the site's seeded volume, then carried in the
    // walk state so volume always mean-reverts to it instead of drifting.
    // `demand_signals` is mutated each step, so we cannot re-read the baseline
    // from there later — the signal state is the durable home for it.
    const baseVolKeyInit = "basevol:" + s.siteId;
    const baseVolume = s.baseVolume ?? signal[baseVolKeyInit] ?? s.volume;
    signal[baseVolKeyInit] = baseVolume;

    // --- Shared local-market "common" walk for this site (the seed's `common`
    // signal). We advance its carried level one step and use the DAY-OVER-DAY
    // change of `common` to move cost — exactly how the seed's cost series
    // tracks `common`. ---
    const commonKey = "common:" + s.siteId;
    const commonPrev = signal[commonKey] ?? 0;
    const commonNow = advanceLevel(commonPrev, commonKey, day, isUS, scale);
    signal[commonKey] = commonNow;
    const commonDelta = commonNow - commonPrev;

    // --- Unit cost = previous cost + common move (+ shock), gently anchored to
    // baseline so it oscillates around home rather than ramping. ---
    const baseCost = s.baseUnitCost ?? s.unitCost;
    let unitCost =
      s.unitCost +
      commonDelta +
      shockDelta * scale +
      0.04 * (baseCost - s.unitCost);
    if (s.siteId === outageSiteId) {
      const spike = sBetween(0.04, 0.09) * scale;
      unitCost += spike;
      events.push({
        scope: "site",
        ref: s.siteId,
        kind: "outage",
        headline: "Local supply disruption",
        detail: "A delivery shortfall lifts this site's wholesale cost sharply for the day.",
        tone: "bad",
      });
    }
    unitCost = Math.max(0.2 * scale, unitCost);

    // --- Pricing model: IDENTICAL to the seed (run-seed.mjs `buildSeries`).
    // Each brand has a private walk `priv`; its "drive" = commonWeight*common +
    // (1-commonWeight)*priv. Retail follows the drive via asymmetric pass-
    // through (rockets up, feathers down). We move the carried price by the
    // DAY-OVER-DAY change in drive, so the live sim continues the same path the
    // seed built — just one day at a time. A gentle pull toward the brand's
    // baseline margin keeps the band anchored over long runs. ---
    const warHere = warRegion && s.region === warRegion;

    // Advance & blend one brand's drive; returns {drive, driveDelta}.
    const brandDrive = (key: string) => {
      const tr = seriesTraits(key);
      const privKey = "priv:" + key;
      const privPrev = signal[privKey] ?? 0;
      const privNow = advanceLevel(privPrev, privKey, day, isUS, scale);
      signal[privKey] = privNow;
      const drive = tr.commonWeight * commonNow + (1 - tr.commonWeight) * privNow;
      const driveKey = "drive:" + key;
      const drivePrev = signal[driveKey] ?? drive;
      signal[driveKey] = drive;
      return { drive, driveDelta: drive - drivePrev, tr };
    };

    const competitors = s.competitors.map((c) => {
      const key = s.siteId + "|" + c.name;
      const cr = mulberry32((seed ^ hash(s.siteId + c.name)) >>> 0);
      const cBetween = (lo: number, hi: number) => lo + cr() * (hi - lo);
      const { driveDelta, tr } = brandDrive(key);

      const baseMargin = c.baseMargin ?? Math.max(0.02 * scale, c.price - unitCost);
      // Follow the drive's day-over-day move (asymmetric pass-through) plus a
      // weak anchor pull toward cost + baseline margin. The pull is gentle so
      // the private walk can carry a brand across its rivals (real crossovers)
      // before slowly being drawn back toward its home margin.
      const up = driveDelta > 0;
      const k = up ? tr.fastUp : tr.slowDown;
      // Asymmetric anchor toward cost + baseline margin. Because pass-through is
      // "rockets up, feathers down" (fastUp ≫ slowDown), a mean-reverting drive
      // ratchets price UP over time — a spurious long-run margin drift. We undo
      // that by pulling HARDER when the margin is above its baseline than below,
      // so over-rich margins decay quickly (the real "feathers") while keeping
      // short-run asymmetry and brand crossovers intact.
      const richC = c.price - (unitCost + baseMargin); // >0 ⇒ margin over baseline
      const pullC = richC > 0 ? 0.22 : 0.07;
      const anchorPull = -pullC * richC;
      let price = c.price + k * driveDelta + anchorPull;
      if (warHere) price -= cBetween(0.01, 0.035) * scale; // undercut in a war
      price = Math.max(unitCost + 0.005 * scale, price);
      return { name: c.name, price: round(price, dp), baseMargin };
    });

    const compAvg =
      competitors.length > 0
        ? competitors.reduce((a, b) => a + b.price, 0) / competitors.length
        : s.egPrice;

    // --- EG price: same process with EG's own private walk + (near-middle)
    // margin, so EG sits in the pack and rivals can be cheaper or dearer. ---
    const egKey = s.siteId + "|EG";
    const egBaseMargin =
      s.baseEgMargin ?? Math.max(0.02 * scale, s.egPrice - unitCost);
    const { driveDelta: egDriveDelta, tr: egTr } = brandDrive(egKey);
    const egUp = egDriveDelta > 0;
    const egK = egUp ? egTr.fastUp : egTr.slowDown;
    // Same asymmetric anchor as competitors: decay over-baseline margins fast so
    // EG's per-unit margin oscillates around its starting level instead of
    // ratcheting up with the rockets-and-feathers pass-through.
    const richEg = s.egPrice - (unitCost + egBaseMargin);
    const pullEg = richEg > 0 ? 0.22 : 0.07;
    const egAnchorPull = -pullEg * richEg;
    let egPrice = s.egPrice + egK * egDriveDelta + egAnchorPull;
    // Never sell below cost + a thin floor.
    egPrice = Math.max(unitCost + 0.02 * scale, egPrice);
    egPrice = round(egPrice, dp);

    // --- Demand reacts to EG's gap vs rivals through elasticity. ---
    // % price change vs competitor average -> volume response. War makes the
    // market more price-sensitive (elasticity effectively stronger).
    //
    // IMPORTANT: volume is computed from the site's BASELINE volume each day,
    // not by compounding yesterday's volume. The elastic price-gap term is the
    // only persistent driver; daily noise mean-reverts (it perturbs around the
    // baseline rather than accumulating). Previously volume was a pure random
    // walk (s.volume * (1 ± noise)) with no anchor, so symmetric noise drifted
    // it up without bound — inflating the margin pool indefinitely.
    const baseVol = baseVolume;
    const gapPct = compAvg > 0 ? (egPrice - compAvg) / compAvg : 0;
    const sensitivity = warHere ? 1.4 : 1;
    const elasticFactor = 1 + s.elasticity * gapPct * sensitivity * 0.4;
    // Persist a small AR(1) demand wobble around the baseline (autocorrelated,
    // mean-reverting) so the volume line is smooth but always pulled home.
    const wobbleKey = "vol:" + s.siteId;
    const prevWobble = signal[wobbleKey] ?? 0;
    const wobble = prevWobble * 0.6 + sBetween(-0.018, 0.018);
    signal[wobbleKey] = wobble;
    let volume = baseVol * elasticFactor * (1 + wobble);
    volume = Math.max(50, Math.round(volume));

    // Occasional idiosyncratic demand swing (event-worthy if large).
    if (sr() < 0.03) {
      const swing = sBetween(-0.18, 0.2);
      volume = Math.max(50, Math.round(volume * (1 + swing)));
      if (Math.abs(swing) > 0.12) {
        events.push({
          scope: "site",
          ref: s.siteId,
          kind: "demand_swing",
          headline: swing > 0 ? "Demand surge" : "Demand dip",
          detail: `Footfall ${swing > 0 ? "rose" : "fell"} ~${Math.abs(
            Math.round(swing * 100)
          )}% at this site today.`,
          tone: swing > 0 ? "good" : "bad",
        });
      }
    }

    return {
      ...s,
      unitCost: round(unitCost, dp + 1),
      egPrice,
      competitors,
      volume,
      baseVolume,
    };
  });

  return { sites: next, events, crudeDelta: shockDelta, signal };
}

/* -------------------------------------------------------------------------- */
/*  Performance snapshot (the "experiment tape")                              */
/* -------------------------------------------------------------------------- */

export interface DailyPerf {
  country: string; // 'US' | 'UK' | 'ALL'
  sites: number;
  volume: number;
  revenue: number;
  marginPool: number;
  avgMargin: number; // volume-weighted per-unit margin
  avgEgPrice: number; // volume-weighted
  avgCompPrice: number | null; // volume-weighted competitor avg
  cheaper: number;
  inLine: number;
  dearer: number;
  /** Counterfactual: hold EG's baseline price flat for the same day. */
  cfVolume: number;
  cfMarginPool: number;
}

/**
 * Volume response of a site to an EG price, vs that day's competitor average,
 * using the SAME elasticity model the day-step uses (so the counterfactual is
 * consistent with the live path). No organic noise — this is the deterministic
 * "what the demand model says" volume at a given EG price.
 */
function modelVolume(s: SimSiteState, egPrice: number, compAvg: number): number {
  const baseVol = s.baseVolume ?? s.volume;
  const gapPct = compAvg > 0 ? (egPrice - compAvg) / compAvg : 0;
  const v = baseVol * (1 + s.elasticity * gapPct * 0.4);
  return Math.max(50, v);
}

/**
 * Build per-country + network ('ALL') performance snapshots from a stepped
 * day's site states. `actual` uses the realized egPrice/volume; the
 * counterfactual re-prices each site at its baseline EG price and re-derives
 * the demand response, so the margin-pool gap is the uplift from active pricing.
 *
 * The positioning band (cheaper / in line / dearer vs local rivals) mirrors the
 * rest of the app: USD ±$0.05, GBP ±£0.02.
 */
export function perfSnapshot(sites: SimSiteState[]): DailyPerf[] {
  type Acc = {
    sites: number;
    volume: number;
    revenue: number;
    marginPool: number;
    egPriceVol: number; // Σ egPrice*volume (for volume-weighted avg)
    compPriceVol: number; // Σ compAvg*volume
    compVol: number; // Σ volume where compAvg known
    cheaper: number;
    inLine: number;
    dearer: number;
    cfVolume: number;
    cfMarginPool: number;
  };
  const blank = (): Acc => ({
    sites: 0,
    volume: 0,
    revenue: 0,
    marginPool: 0,
    egPriceVol: 0,
    compPriceVol: 0,
    compVol: 0,
    cheaper: 0,
    inLine: 0,
    dearer: 0,
    cfVolume: 0,
    cfMarginPool: 0,
  });
  const accs = new Map<string, Acc>();
  const get = (k: string) => {
    let a = accs.get(k);
    if (!a) accs.set(k, (a = blank()));
    return a;
  };

  for (const s of sites) {
    const band = s.country === "US" ? 0.05 : 0.02;
    const compAvg =
      s.competitors.length > 0
        ? s.competitors.reduce((a, b) => a + b.price, 0) / s.competitors.length
        : s.egPrice;

    // Realized.
    const vol = s.volume;
    const margin = s.egPrice - s.unitCost;
    const pool = margin * vol;
    const gap = s.egPrice - compAvg;
    const pos = gap < -band ? "cheaper" : gap > band ? "dearer" : "inLine";

    // Counterfactual = "no active pricing": EG simply passes the SAME day's
    // cost through at its baseline per-unit margin, and faces the SAME local
    // market (today's competitor average). This is a fair comparison — both
    // paths see identical costs and rivals; only the pricing POLICY differs, so
    // the gap is genuinely the value active pricing adds (and the CF can beat
    // the actual on days where the active price drifted off the sweet spot).
    //
    // (The old CF froze EG's day-0 ABSOLUTE price while costs rose underneath
    // it, which structurally crushed the CF margin every day as crude drifted
    // up — manufacturing a runaway, always-positive uplift.)
    const baseMarginEg =
      s.baseEgMargin ?? Math.max(0, (s.baseEgPrice ?? s.egPrice) - s.unitCost);
    const cfPrice = s.unitCost + baseMarginEg;
    const cfVol = modelVolume(s, cfPrice, compAvg);
    const cfPool = (cfPrice - s.unitCost) * cfVol;

    for (const k of [s.country, "ALL"]) {
      const a = get(k);
      a.sites += 1;
      a.volume += vol;
      a.revenue += s.egPrice * vol;
      a.marginPool += pool;
      a.egPriceVol += s.egPrice * vol;
      a.compPriceVol += compAvg * vol;
      a.compVol += vol;
      a[pos] += 1;
      a.cfVolume += cfVol;
      a.cfMarginPool += cfPool;
    }
  }

  const out: DailyPerf[] = [];
  for (const [country, a] of accs) {
    out.push({
      country,
      sites: a.sites,
      volume: a.volume,
      revenue: a.revenue,
      marginPool: a.marginPool,
      avgMargin: a.volume > 0 ? a.marginPool / a.volume : 0,
      avgEgPrice: a.volume > 0 ? a.egPriceVol / a.volume : 0,
      avgCompPrice: a.compVol > 0 ? a.compPriceVol / a.compVol : null,
      cheaper: a.cheaper,
      inLine: a.inLine,
      dearer: a.dearer,
      cfVolume: a.cfVolume,
      cfMarginPool: a.cfMarginPool,
    });
  }
  return out;
}
